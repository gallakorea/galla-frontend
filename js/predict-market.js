/* =========================================================
   predict-market.js — 예측 상세/참여 (파리뮤추얼 · 아케이드)
   한 결과에 GP로 참여한다. 리턴 = 상금풀 ÷ 그 결과 풀 (실시간).
   정산 시 승자들이 풀 전체를 참여 비율로 분배 + 연승 콤보.
   ─ 이중 모드(MPA/SPA):
     · MPA(predict-market.html 단독 문서): 기존처럼 DOMContentLoaded 자동 초기화.
     · SPA(app.html): window.GALLA_PAGE_PREDICT_MARKET.mount(root, params)를 어댑터가 호출.
       요소 조회는 root(D) 스코프 — pmToast 등이 갈라예측 탭(galla-predict.html)과 id가 겹친다.
========================================================= */
(function () {   // 전역 오염·충돌 방지 — SPA에선 galla-predict.js(탭)와 같은 문서에 살며 supa·$ 등 이름이 겹친다
let supa = null, ME = null, MARKET = null, OUTCOMES = [], STATE = null;
let SEL = null;            // 선택한 outcome id
let MY_SAVED = false;
let MY_BAL = 0;
// 조회 루트 — MPA면 document, SPA면 view-host. $는 항상 현재 루트 스코프로 찾는다.
let D = document;
const $ = id => (D === document) ? document.getElementById(id) : D.querySelector('#' + id);
let marketId = Number(new URLSearchParams(location.search).get('id'));   // SPA에선 mount(params)가 덮어쓴다

function toast(msg){const t=$('pmToast');t.textContent=msg;t.hidden=false;clearTimeout(t._t);t._t=setTimeout(()=>t.hidden=true,2200);}
function fmt(n){return Math.round(Number(n)||0).toLocaleString('ko-KR');}
function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function isMulti(){return MARKET && MARKET.market_type==='multi';}
function ago(ts){const s=Math.floor((Date.now()-new Date(ts))/1000);if(s<60)return '방금';if(s<3600)return Math.floor(s/60)+'분 전';if(s<86400)return Math.floor(s/3600)+'시간 전';return Math.floor(s/86400)+'일 전';}
function timeLeft(c){const ms=new Date(c)-Date.now();if(ms<=0)return '마감됨';const d=Math.floor(ms/86400000);if(d>=1)return `D-${d}`;const h=Math.floor(ms/3600000);return h>=1?`${h}시간 남음`:`${Math.max(1,Math.floor(ms/60000))}분 남음`;}
function needLogin(){ if(ME) return false; if(confirm('로그인이 필요합니다. 로그인 페이지로 이동할까요?')) (window.GALLA_gotoLogin ? GALLA_gotoLogin() : (window.GALLA_nav||function(u){location.href=u})('login.html')); return true; }
function comboMult(n){ return n>=10?2.5:n>=5?1.8:n>=3?1.4:n>=2?1.2:1; }
function ocLabel(id){ const o=OUTCOMES.find(x=>x.id===Number(id)); return o?o.label:''; }
// 이진 마켓의 '예'가 sort 0 — 사이드 클래스(색)용
function sideOf(o){ return o.sort===0||o.sort_order===0 ? 'yes' : 'no'; }

/* 상금풀·리턴 헬퍼 (STATE 기반) */
function prizePool(){ return (STATE?.total_pool||0) + (STATE?.jackpot||0); }
function oddsOf(o){ return o.pool>0 ? prizePool()/o.pool : null; }

/* ============ 저장·공유 (위임) ============ */
document.addEventListener('click', async e => {
  const btn = e.target.closest('#pmdSaveBtn');
  if(!btn) return;
  if(needLogin()) return;
  btn.disabled = true;
  try{
    if(MY_SAVED) await supa.from('market_bookmarks').delete().eq('market_id',marketId).eq('user_id',ME.id);
    else await supa.from('market_bookmarks').insert({market_id:marketId,user_id:ME.id});
    MY_SAVED=!MY_SAVED;
    btn.classList.toggle('on',MY_SAVED);
    const lbl=btn.querySelector('.pb-save-txt'); if(lbl) lbl.textContent=MY_SAVED?'저장됨':'저장';
  } finally{ btn.disabled=false; }
});
document.addEventListener('click', async e => {
  if(!e.target.closest('#pmdShareBtn')) return;
  const url = window.GALLA_shareUrl ? window.GALLA_shareUrl('predict',marketId) : new URL(`predict-market.html?id=${marketId}`,location.href).href;
  const title = MARKET?.question ? `🎯 ${MARKET.question}` : 'GALLA 갈라예측';
  if(window.GALLA_share) return window.GALLA_share({url,title,text:'GP로 겨루는 예측 배틀, 갈라예측'});
  try{ await navigator.clipboard.writeText(url); toast('링크가 복사되었습니다.'); }catch{ toast('링크 복사 실패'); }
});

/* ============ init ============ */
let LIVE_TIMER = null;
async function initPredictMarket(root, spaParams){
  D = (root && root !== document && root.querySelector) ? root : document;
  // 재-mount 대비 상태 리셋(스택은 매번 새로 mount — 다른 마켓 id로 재진입 가능)
  MARKET=null; OUTCOMES=[]; STATE=null; SEL=null; MY_SAVED=false; MY_BAL=0; MY_PAID=0;
  TAB='comments'; CMT_SIDE=null; MY_POS_SIDE=null; CMT_DATA=null; CMT_TOP_LIMIT=8; CMT_EXPANDED.clear();
  window.__PB_PREV_ODDS = {};
  if (LIVE_TIMER) { clearInterval(LIVE_TIMER); LIVE_TIMER = null; }
  marketId = Number((spaParams && spaParams.id != null) ? spaParams.id : new URLSearchParams(location.search).get('id'));

  supa = await waitForSupabaseClient();
  const { data } = await supa.auth.getSession();
  ME = data?.session?.user || null;
  await refreshBalance();
  if(!marketId){ $('pmdMain').innerHTML='<div class="empty-zone">잘못된 접근입니다.</div>'; return; }
  await loadMarket();
  // 라이브 갱신: 30초마다 풀·리턴·피드 재조회 (열려있을 때만) — SPA unmount 시 해제
  LIVE_TIMER = setInterval(async ()=>{ if(MARKET && !MARKET.resolved && !document.hidden){ await refreshState(); renderHero(); loadFeed(); } }, 30000);
}
if (!(document.body && document.body.dataset.page === 'spa')) {
  document.addEventListener('DOMContentLoaded', () => initPredictMarket(document));
}

let MY_PAID=0;
async function refreshBalance(){
  if(!ME) return;
  // 예측은 무료 GP만 사용 가능(유료 충전 GP는 아이템·꾸미기 등 소각형 전용)
  const {data}=await supa.rpc('gp_wallet');
  if(data?.ok){ MY_BAL=data.free; MY_PAID=data.paid; }
}

async function loadMarket(){
  const { data: m, error } = await supa.from('markets').select('*').eq('id',marketId).single();
  if(error||!m){ $('pmdMain').innerHTML='<div class="empty-zone">마켓을 찾을 수 없습니다.</div>'; return; }
  MARKET=m;

  // 소유자·관리자 ⋯ 메뉴 (SPA에선 페이지 헤더가 셸 크롬으로 제거돼 없을 수 있다)
  const moreBtn=$('header-more-btn');
  if(moreBtn && window.GALLA_canManage){
    moreBtn.style.display='none';
    window.GALLA_canManage(m.created_by).then(can=>{
      if(!can) return;
      moreBtn.style.display='';
      moreBtn.onclick=()=>window.GALLA_openOwnerMenu({
        table:'markets', id:m.id, ownerId:m.created_by, label:'예측',
        deleteHint:'참여가 있으면 삭제할 수 없습니다 (정산 이용).',
        editFields:[
          { key:'description', label:'설명', type:'textarea', value:m.description||'' },
          { key:'category', label:'카테고리', type:'select', options:window.GALLA_CATEGORIES, value:m.category||'' },
          { key:'close_at', label:'마감 시각', type:'datetime', value:m.close_at||'' },
        ],
        onSaved:()=>location.reload(),
        onDeleted:()=>{ (window.GALLA_nav||function(u){location.href=u})('galla-predict.html'); },
      });
    });
  }

  MY_SAVED=false;
  if(ME){
    const { data: bm } = await supa.from('market_bookmarks').select('market_id').eq('market_id',marketId).eq('user_id',ME.id).maybeSingle();
    MY_SAVED=!!bm;
  }
  await refreshState();
  render();
}

async function refreshState(){
  const { data, error } = await supa.rpc('predict_state',{p_market_id:marketId});
  if(error||!data?.ok){ console.error('[predict_state]',error||data); return; }
  STATE=data;
  OUTCOMES=(data.outcomes||[]).map(o=>({...o,sort_order:o.sort}));
  if(SEL==null || !OUTCOMES.find(o=>o.id===SEL)) SEL = OUTCOMES[0]?.id ?? null;
}

/* ============ 렌더 ============ */
function render(){
  const m=MARKET;
  const closed = m.resolved || new Date(m.close_at)<=Date.now();
  const canResolve = !m.resolved && (ME && (m.created_by===ME.id)); // 관리자는 서버서 판정, 버튼은 생성자/관리자에게 (canManage로 확장)
  $('pmdMain').innerHTML=`
  <div class="pb-wrap">
    <div class="pb-cat">
      <span>${esc(m.category||'')}</span>
      ${STATE?.is_jackpot?'<span class="pm-jp-badge">🎁 보너스</span>':''}
      ${m.resolved?'<span class="pm-badge-win">✔ 정산 완료</span>':(closed?'<span>⏳ 마감 · 정산 대기</span>':`<span class="pm-badge-live"><i></i>LIVE · ${timeLeft(m.close_at)}</span>`)}
    </div>
    ${m.image_url?`<div class="pb-img"><img src="${esc(m.image_url)}" alt="" loading="lazy" onerror="this.closest('.pb-img')?.remove()"></div>`:''}
    <div class="pb-q">${esc(m.question)}</div>
    <div class="pmd-creator" id="pmdCreator" hidden></div>
    ${m.description?`<div class="pb-desc">${esc(m.description)}</div>`:''}
    ${m.issue_id?`<a class="pb-issue-link" href="issue.html?id=${m.issue_id}">⚔️ 원본 이슈에서 진영 대결 보기 →</a>`:''}

    <div class="pb-hero ${STATE?.is_jackpot?'jackpot':''}" id="pbHero"></div>

    <div id="pbMine"></div>
    <div id="pbPanel"></div>
    <div id="pbResolved"></div>
    <div id="pbAdmin"></div>

    <div class="pb-actions">
      <button class="pb-act ${MY_SAVED?'on':''}" id="pmdSaveBtn">
        <svg viewBox="0 0 24 24"><path d="M18 21l-6-4.3L6 21V5.5A2.5 2.5 0 0 1 8.5 3h7A2.5 2.5 0 0 1 18 5.5V21z"/></svg>
        <span class="pb-save-txt">${MY_SAVED?'저장됨':'저장'}</span>
      </button>
      <button class="pb-act" id="pmdShareBtn">
        <svg viewBox="0 0 24 24"><path d="M21.5 2.5L10.8 13.2"/><path d="M21.5 2.5l-6.8 19-3.9-8.3-8.3-3.9 19-6.8z"/></svg> 공유
      </button>
      <button class="pb-act" data-galvis data-gv-type="predict" data-gv-id="${esc(String(m.id))}" data-gv-title="${esc(m.question||'')}">
        <svg class="gv-galvis" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="8.2" stroke-width="1.5" stroke-dasharray="2.3 2.2"/><circle cx="12" cy="12" r="4.7" stroke-width="1.3"/><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/></svg> 갈비스
      </button>
    </div>

    <div class="pb-live">
      <div class="pb-live-h"><span class="pm-badge-live"><i></i>LIVE</span> 실시간 참여</div>
      <div id="pbFeed"></div>
    </div>

    <div class="pmd-tabs">
      <button class="pmd-tab active" data-tab="comments">💬 의견 배틀</button>
      <button class="pmd-tab" data-tab="holders">💰 참여 랭킹</button>
    </div>
    <div id="pmdTabBody"></div>
  </div>`;

  renderHero();
  renderMine();
  renderPanel(closed);
  renderResolved();
  renderAdmin(closed, canResolve);
  renderCreatorBlock(m);
  loadFeed();
  bindTabs();
  loadTab('comments');
}

/* 크리에이터 블록 — 아바타·등급·활동명(탭=팝오버)·팔로우 (이슈 상세와 동일 급) */
async function renderCreatorBlock(m){
  const box=$('pmdCreator');
  if(!box || !m.created_by) return;
  if(window.GALLA_userMap) await window.GALLA_userMap([m.created_by]);
  const u=(window.__GU_CACHE||{})[m.created_by]||{};
  const nick=u.nickname||'갈라 예언자';
  const av=u.avatar_url
    ? `<img src="${esc(window.GALLA_avatarSrc?window.GALLA_avatarSrc(u.avatar_url):u.avatar_url)}" alt="" onerror="this.style.display='none'">`
    : `<span class="pza-init">${esc(nick.trim().charAt(0)||'갈')}</span>`;
  box.hidden=false;
  box.innerHTML=`
    <span class="pza-av" data-user-id="${esc(m.created_by)}" data-user-nick="${esc(nick)}">${av}</span>
    <span class="pza-info">
      <span class="pza-name" data-user-id="${esc(m.created_by)}" data-nick-uid="${esc(m.created_by)}" data-user-nick="${esc(nick)}">${esc(nick)}</span>
      <span class="pza-sub">🔮 이 판을 연 예언자 — 운명을 걸어보시죠</span>
    </span>
    <button type="button" class="js-follow pza-follow" data-uid="${esc(m.created_by)}">+ 팔로우</button>`;
  window.GALLA_bindFollow && window.GALLA_bindFollow(box);
}

function renderHero(){
  const el=$('pbHero'); if(!el||!STATE) return;
  const outs=OUTCOMES;
  const yes=outs.find(o=>sideOf(o)==='yes')||outs[0];
  const no=outs.find(o=>o!==yes)||outs[1];
  const py=yes?.pool||0, pn=no?.pool||0, tot=py+pn;
  const yp=tot>0?Math.round(py/tot*100):50;
  // 보너스 마켓: 히어로에 반짝이 별이 떠다닌다
  const sparkles=STATE.is_jackpot
    ? `<span class="pb-spark s1">✨</span><span class="pb-spark s2">✨</span><span class="pb-spark s3">💫</span><span class="pb-spark s4">🪙</span>` : '';
  el.innerHTML=`${sparkles}
    <div class="pm-odds">
      <div class="pm-odds-bar" style="height:40px">
        <div class="pm-odds-side yes shine" style="width:${Math.max(16,Math.min(84,yp))}%"><span class="lab">${esc(yes?.label||'예')} ${yp}%</span></div>
        <div class="pm-odds-side no shine" style="width:${Math.max(16,Math.min(84,100-yp))}%"><span class="lab">${esc(no?.label||'아니오')} ${100-yp}%</span></div>
      </div>
    </div>
    <div class="pb-pool-row">
      <div>
        <div class="pb-pool-lbl">${(STATE.jackpot||0)>0?'보너스 포함 상금풀':'현재 상금풀'}</div>
        <div class="pb-pool-n glow" data-to="${Math.round(prizePool())}">0<small> GP</small></div>
      </div>
      <div class="pb-ppl">👥 <b>${fmt(STATE.participants||0)}</b>명 참여</div>
    </div>`;
  poolCountUp(el);
}

/* 상금풀 카운트업 (0 → 목표, easeOutCubic) */
function poolCountUp(root){
  const el=root.querySelector('[data-to]'); if(!el) return;
  const to=+el.dataset.to||0;
  if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches){ el.childNodes[0].textContent=fmt(to); return; }
  const t0=performance.now(), dur=850;
  (function tick(t){ const k=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-k,3);
    el.childNodes[0].textContent=fmt(Math.round(to*e));
    if(k<1) requestAnimationFrame(tick); })(t0);
}

function renderMine(){
  const el=$('pbMine'); if(!el) return;
  const my=STATE?.my_bets||{};
  const entries=Object.entries(my).filter(([,v])=>v>0);
  if(!entries.length){ el.innerHTML=''; return; }
  const rows=entries.map(([oid,s])=>{
    const o=OUTCOMES.find(x=>x.id===Number(oid));
    const od=o?oddsOf(o):null;
    const est=od?Math.round(s*od):null;
    return `💰 <b>${esc(ocLabel(oid))}</b>에 <b>${fmt(s)}GP</b>${est?` → 적중 시 예상 <b>${fmt(est)}GP</b>`:''}`;
  }).join('<br>');
  el.innerHTML=`<div class="pb-mine">${rows}</div>`;
}

function renderPanel(closed){
  const el=$('pbPanel'); if(!el) return;
  if(closed){ el.innerHTML=''; return; }
  // 리턴 변동 감지 → 오르면 골드, 내리면 레드 플래시 (주식 시세판)
  window.__PB_PREV_ODDS ||= {};
  const outBtns=OUTCOMES.map(o=>{
    const od=oddsOf(o);
    const side=sideOf(o);
    const prev=window.__PB_PREV_ODDS[o.id];
    const tick=(prev!=null&&od!=null&&Math.abs(od-prev)>0.005)?(od>prev?' tick-up':' tick-down'):'';
    window.__PB_PREV_ODDS[o.id]=od;
    return `<button class="pb-out ${side} ${SEL===o.id?'sel':''}" data-haptic="vote" data-oid="${o.id}">
      <span class="lb">${esc(o.label)}</span>
      <span class="od${tick}">×${od?od.toFixed(2):'–'}</span>
      <span class="pool">${fmt(o.pool)}GP · ${o.bettors||0}명</span>
    </button>`;
  }).join('');
  el.innerHTML=`
    <div class="pb-outs">${outBtns}</div>
    <div class="pb-panel">
      <div class="pb-panel-h"><span>참여 금액</span><span>참여 가능 <b id="pbBal">${ME?fmt(MY_BAL)+'GP':'로그인 필요'}</b>${ME&&MY_PAID>0?` <small style="color:#5c6479">(충전 GP ${fmt(MY_PAID)} 별도)</small>`:''}</span></div>
      <div class="pb-chips">
        <button class="pb-chip" data-amt="100">100</button>
        <button class="pb-chip" data-amt="500">500</button>
        <button class="pb-chip" data-amt="1000">1천</button>
        <button class="pb-chip" data-amt="5000">5천</button>
        <button class="pb-chip allin" data-amt="allin">최대</button>
      </div>
      <div class="pb-custom"><input id="pbAmt" type="number" inputmode="numeric" min="10" placeholder="직접 입력 (최소 10GP)"></div>
      <div class="pb-est"><span id="pbEstL">예상 리턴</span><b id="pbEst">—</b></div>
      <button class="pb-bet" id="pbBet">🎯 예측하기</button>
    </div>`;

  el.querySelectorAll('.pb-out').forEach(b=>b.onclick=async ()=>{
    // 로그인 필수 — 미로그인은 결과(입장) 선택 자체를 막고 로그인으로 유도
    if(window.GALLA_requireLogin){ if(!(await window.GALLA_requireLogin('예측 참여는 로그인 후 가능해요.'))) return; }
    else if(needLogin()) return;
    SEL=Number(b.dataset.oid);
    el.querySelectorAll('.pb-out').forEach(x=>x.classList.toggle('sel',Number(x.dataset.oid)===SEL));
    updateEst();
  });
  el.querySelectorAll('.pb-chip').forEach(b=>b.onclick=()=>{
    const inp=$('pbAmt');
    if(b.dataset.amt==='allin'){ if(needLogin())return; inp.value=Math.floor(MY_BAL); }
    else inp.value=Number(inp.value||0)+Number(b.dataset.amt);
    if(window.GALLA_FX){ const r=b.getBoundingClientRect(); window.GALLA_FX.burst(r.left+r.width/2,r.top,{emojis:['🪙'],count:5,spread:34,up:30}); }
    updateEst();
  });
  $('pbAmt').oninput=updateEst;
  $('pbBet').onclick=placeBet;
  updateEst();
}

/* 예상 리턴: 내 참여분이 풀에 들어간 후 기준 (파리뮤추얼) */
function updateEst(){
  const est=$('pbEst'); if(!est) return;
  const amt=Number($('pbAmt')?.value||0);
  const o=OUTCOMES.find(x=>x.id===SEL);
  if(!o||amt<=0){ est.textContent='—'; return; }
  const od=(prizePool()+amt)/((o.pool||0)+amt);
  est.textContent=`×${od.toFixed(2)} → ${fmt(amt*od)}GP`;
}

async function placeBet(){
  if(needLogin()) return;
  const amt=Number($('pbAmt').value||0);
  if(!SEL) return toast('결과를 선택하세요.');
  if(amt<10) return toast('최소 10GP부터 참여할 수 있어요.');
  if(amt>MY_BAL){
    // 예측은 무료 GP 전용 — 충전 유도(needGP)는 오도라 금지. 무료 획득 경로 안내.
    return toast('무료 GP가 부족해요. 출석·데일리 미션으로 GP를 모아 참여하세요! 🪙');
  }
  const btn=$('pbBet'); btn.disabled=true; btn.textContent='참여 중…';
  try{
    const { data, error } = await supa.rpc('place_bet',{p_market_id:marketId,p_outcome_id:SEL,p_stake:amt});
    if(error) throw error;
    if(!data.ok){
      if(data.reason==='insufficient' && Number(data.paid)>0){
        // 유료 충전 GP는 게임 투입 불가 — 정책 안내
        toast('충전 GP는 예측에 쓸 수 없어요. 무료 GP(출석·미션 보상)가 부족합니다.');
        return;
      }
      const msg={closed:'마감된 예측입니다.',insufficient:'GP가 부족합니다.',other_side:'이미 다른 결과에 참여했어요. 한 예측엔 한 편만!',below_min:'최소 참여 금액 미만입니다.',above_max:'최대 참여 한도를 넘었어요.'}[data.reason]||'참여에 실패했습니다.';
      toast(msg); return;
    }
    MY_BAL=data.balance;
    // 칩 던지기 연출
    if(window.GALLA_FX){
      const r=btn.getBoundingClientRect();
      window.GALLA_FX.burst(r.left+r.width/2,r.top,{emojis:['🪙','💰','✨'],count:16,spread:80,up:50});
      window.GALLA_FX.flash();
    }
    toast(`🎯 ${fmt(amt)}GP 예측 참여! 리턴 ×${data.odds}`);
    $('pbAmt').value='';
    await refreshState();
    renderHero(); renderMine(); renderPanel(false); loadFeed();
    // 의견 배틀 컴포저의 진영 잠금(💰 참여자)도 즉시 반영 — 새로고침 불필요
    loadTab(TAB);
  }catch(e){ console.error(e); toast('참여에 실패했습니다.'); }
  finally{ btn.disabled=false; btn.textContent='🎯 예측하기'; }
}

/* ============ 정산 결과 ============ */
function renderResolved(){
  const el=$('pbResolved'); if(!el) return;
  if(!MARKET.resolved){ el.innerHTML=''; return; }
  const win=OUTCOMES.find(o=>o.id===STATE?.resolved_outcome_id) || OUTCOMES.find(o=>o.is_winner);
  const my=STATE?.my_bets||{};
  const myWinStake = win ? Number(my[win.id]||0) : 0;
  const myTotal = Object.values(my).reduce((s,v)=>s+Number(v),0);
  let myLine='';
  if(myWinStake>0){
    const payout = win.pool>0 ? myWinStake/win.pool*prizePool() : myWinStake;
    myLine=`<div class="pb-win-banner">🎉 +${fmt(payout)}GP 획득!</div><div class="s">연승 콤보 보너스는 지갑에 별도 지급</div>`;
    if(!sessionStorage.getItem('pbCele'+marketId)){
      sessionStorage.setItem('pbCele'+marketId,'1');
      celebrate(payout);
    }
  } else if(myTotal>0){ myLine=`<div class="s">아쉽지만 다음 기회에… 연승이 초기화됐어요 🔄</div>`; }
  el.innerHTML=`<div class="pb-resolved">
    <div class="t">🏁 결과: <b>${esc(win?win.label:'')}</b> 적중</div>
    <div class="s">총 ${fmt(prizePool())}GP가 승자들에게 분배되었습니다</div>
    ${myLine}
  </div>`;
}

function celebrate(payout){
  if(window.GALLA_FX) window.GALLA_FX.confetti({count:120});
  const d=document.createElement('div');
  d.className='pb-cele';
  d.innerHTML=`<div class="pb-cele-card">
    <div class="pb-cele-emo">🏆</div>
    <div class="pb-cele-t">예측 적중!</div>
    <div class="pb-cele-n">+${fmt(payout)} GP</div>
    <div class="pb-cele-sub">승자의 몫이 지갑에 지급되었습니다</div>
    <button class="pb-cele-share">🎺 자랑하기</button>
    <button class="pb-cele-close">확인</button>
  </div>`;
  document.body.appendChild(d);
  // 결과 공유 카드 — /share/predict OG 랜딩으로 자랑
  d.querySelector('.pb-cele-share').onclick=()=>{
    const url=window.GALLA_shareUrl?window.GALLA_shareUrl('predict',marketId):new URL(`predict-market.html?id=${marketId}`,location.href).href;
    const title=`🏆 예측 적중! +${fmt(payout)}GP — ${MARKET?.question||''}`;
    if(window.GALLA_share) window.GALLA_share({url,title,text:'나의 예측이 적중했다! 갈라예측에서 겨뤄보자 🎯'});
  };
  d.querySelector('.pb-cele-close').onclick=()=>d.remove();
  d.onclick=e=>{ if(e.target===d) d.remove(); };
}

/* ============ 정산 패널 (생성자/관리자) ============ */
function renderAdmin(closed, canResolve){
  const el=$('pbAdmin'); if(!el) return;
  el.innerHTML='';
  if(MARKET.resolved) return;
  // 생성자이거나 관리자(canManage 비동기)일 때 표시
  const show=(ok)=>{
    if(!ok) return;
    el.innerHTML=`<div class="pb-admin">
      <div class="h">🛠 수동 정산(오버라이드) — 마감 후엔 AI가 자동 정산합니다. 결과를 먼저 확정하려면 선택하세요.</div>
      <div class="pb-admin-btns">${OUTCOMES.map(o=>`<button class="pb-admin-btn ${sideOf(o)}" data-oid="${o.id}">${esc(o.label)} 적중</button>`).join('')}</div>
    </div>`;
    el.querySelectorAll('.pb-admin-btn').forEach(b=>b.onclick=async ()=>{
      const o=OUTCOMES.find(x=>x.id===Number(b.dataset.oid));
      if(!confirm(`정말 '${o.label}'(으)로 정산할까요?\n총 ${fmt(prizePool())}GP가 승자에게 분배됩니다.`)) return;
      b.disabled=true;
      const { data, error } = await supa.rpc('predict_resolve',{p_market_id:marketId,p_outcome_id:o.id});
      if(error||!data?.ok){ console.error(error||data); toast('정산 실패: '+(data?.reason||error?.message||'')); b.disabled=false; return; }
      toast(`🏁 정산 완료 — ${data.paid_users}명에게 ${fmt(data.distributed)}GP 분배`);
      location.reload();
    });
  };
  if(ME && MARKET.created_by===ME.id) show(true);
  else if(window.GALLA_canManage) window.GALLA_canManage(MARKET.created_by).then(show);
}

/* ============ 라이브 참여 피드 ============ */
async function loadFeed(){
  const el=$('pbFeed'); if(!el) return;
  const { data } = await supa.from('predict_bets')
    .select('user_id,outcome_id,stake,odds_at_bet,created_at').eq('market_id',marketId)
    .order('created_at',{ascending:false}).limit(25);
  if(!data||!data.length){ el.innerHTML='<div class="pmd-tab-empty">첫 예측의 주인공이 되어보세요!</div>'; return; }
  const profs=await fetchProfiles(data.map(b=>b.user_id));
  el.innerHTML=data.map((b,i)=>{
    const o=OUTCOMES.find(x=>x.id===b.outcome_id);
    const side=o?sideOf(o):'yes';
    const big=b.stake>=5000?' whale':'';   // 🐋 하이롤러 강조
    return `<div class="pb-feed-row in${big}" style="--i:${i}">
      <span class="pb-feed-side ${side}">${esc(o?o.label:'')}</span>
      <span class="pb-feed-txt">${b.stake>=5000?'🐋 ':''}<b data-nick-uid="${esc(b.user_id)}">${esc(profs[b.user_id]?.nickname||'익명')}</b>님이 <b>${fmt(b.stake)}GP</b> 참여${b.odds_at_bet?` (×${Number(b.odds_at_bet).toFixed(2)})`:''}</span>
      <span class="pb-feed-time">${ago(b.created_at)}</span>
    </div>`;
  }).join('');
}

async function fetchProfiles(ids){
  const map={};
  const uniq=[...new Set(ids.filter(Boolean))];
  if(!uniq.length) return map;
  // 정본 users에서 아바타·레벨까지 (닉네임 정본 + GALLA_userBadge 캐시 공유)
  if (window.GALLA_userMap) await window.GALLA_userMap(uniq);
  const { data } = await supa.from('users').select('id,nickname,level,avatar_url').in('id',uniq);
  data?.forEach(p=>map[p.id]={ user_id:p.id, ...p });
  return map;
}

/* ============ 탭: 의견 배틀 / 참여 랭킹 ============ */
let TAB='comments';
function bindTabs(){
  D.querySelectorAll('.pmd-tab').forEach(b=>b.addEventListener('click',()=>{
    D.querySelectorAll('.pmd-tab').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    TAB=b.dataset.tab; loadTab(TAB);
  }));
}
async function loadTab(kind){
  const body=$('pmdTabBody');
  body.innerHTML=`<div class="pmd-tab-loading">불러오는 중…</div>`;
  if(kind==='comments') return loadComments(body);
  if(kind==='holders') return loadHolders(body);
}
function emptyTab(msg){ return `<div class="pmd-tab-empty">${msg}</div>`; }

/* ----- 참여 랭킹: 참여 GP 큰 순 ----- */
async function loadHolders(body){
  const { data } = await supa.from('predict_bets')
    .select('user_id,outcome_id,stake').eq('market_id',marketId);
  if(!data||!data.length){ body.innerHTML=emptyTab('아직 참여자가 없습니다.'); return; }
  const agg={};
  data.forEach(b=>{ const k=b.user_id+':'+b.outcome_id; (agg[k]||={user_id:b.user_id,outcome_id:b.outcome_id,total:0}).total+=b.stake; });
  const rows=Object.values(agg).sort((a,b)=>b.total-a.total).slice(0,30);
  const profs=await fetchProfiles(rows.map(r=>r.user_id));
  body.innerHTML=`<div class="pmd-holders">`+rows.map((r,i)=>{
    const o=OUTCOMES.find(x=>x.id===r.outcome_id);
    const side=o?sideOf(o):'yes';
    return `<div class="pmd-holder-row">
      <span class="pmd-holder-rank">${i+1}</span>
      <span class="pmd-holder-name" data-nick-uid="${esc(r.user_id)}">${esc(profs[r.user_id]?.nickname||'익명')}</span>
      <span class="pmd-holder-side ${side}">${esc(o?o.label:'')} ${fmt(r.total)}GP</span>
    </div>`;}).join('')+`</div>`;
}

/* ----- 댓글: 의견 배틀 (참여 진영 잠금 + 홀더 뱃지 + 대댓글 @멘션) ----- */
let CMT_SIDE=null, MY_POS_SIDE=null;
let CMT_DATA=null, CMT_TOP_LIMIT=8;
const CMT_EXPANDED=new Set();
const OC_COLORS=['#3d6bff','#ff4d67','#35e0a0','#9b5bff','#ff9f40','#c9d1e0','#4dd0e1','#ff7ab6'];
function ocColor(ocId){ const i=OUTCOMES.findIndex(o=>o.id===Number(ocId)); return i>=0?OC_COLORS[i%OC_COLORS.length]:'#8b8b93'; }
function cmtSideName(side, ocId){ if(!isMulti()) return side==='yes'?(ocLabel(OUTCOMES.find(o=>sideOf(o)==='yes')?.id)||'예'):(ocLabel(OUTCOMES.find(o=>sideOf(o)==='no')?.id)||'아니오'); return ocId?ocLabel(ocId):'기타'; }
function cmtSideLabel(side, ocId){ if(!isMulti()) return (side==='yes'?'👍 ':'👎 ')+cmtSideName(side,ocId); return ocId?'🎯 '+ocLabel(ocId):'🤔 기타'; }
function ocChipStyle(side, ocId){
  if(!isMulti()) return '';
  if(!ocId) return 'color:#b8b8bf;background:rgba(255,255,255,.06);border-color:#3a3a3a';
  const c=ocColor(ocId); return `color:${c};background:${c}22;border-color:${c}99`;
}
function cmtBody(content){ return esc(content).replace(/@(\S+)/g,'<span class="pmd-mention">@$1</span>'); }

async function loadComments(body){
  // 내 참여로 진영 잠금 (파리뮤추얼: my_bets의 outcome → side)
  MY_POS_SIDE=null;
  const my=STATE?.my_bets||{};
  const myOid=Object.keys(my).find(k=>Number(my[k])>0);
  if(!isMulti() && myOid){
    const o=OUTCOMES.find(x=>x.id===Number(myOid));
    MY_POS_SIDE=o?sideOf(o):null;
    CMT_SIDE=MY_POS_SIDE;
  } else CMT_SIDE=null;

  const { data: rows } = await supa.from('market_comments')
    .select('id,user_id:author_id,side,content,created_at,parent_id,outcome_id,is_anonymous,ghost_seed,locale').eq('market_id',marketId)
    .order('created_at',{ascending:true}).limit(500);
  // 베팅을 안 했어도, 이미 이 예측에 댓글을 남겼다면 '그때 입장'으로 고정한다(한 예측=한 입장, 사장님 요청).
  if(!isMulti() && !MY_POS_SIDE && ME){
    const mineC=(rows||[]).find(c=>c.user_id===ME.id && (c.side==='yes'||c.side==='no'));
    if(mineC){ MY_POS_SIDE=mineC.side; CMT_SIDE=mineC.side; }
  }
  const profs=await fetchProfiles((rows||[]).map(c=>c.user_id));
  const ids=(rows||[]).map(c=>c.id);
  const likeAgg={}; const myLikes=new Set();
  if(ids.length){
    const { data: likes } = await supa.from('market_comment_likes').select('comment_id,user_id').in('comment_id',ids);
    likes?.forEach(l=>{ likeAgg[l.comment_id]=(likeAgg[l.comment_id]||0)+1; if(ME&&l.user_id===ME.id) myLikes.add(l.comment_id); });
  }
  // 작성자 실참여 여부(💰 참여자 뱃지) — predict_bets 기준
  const posMap={};
  const authorIds=[...new Set((rows||[]).map(c=>c.user_id).filter(Boolean))];
  if(authorIds.length){
    const { data: bets } = await supa.from('predict_bets')
      .select('user_id,outcome_id').eq('market_id',marketId).in('user_id',authorIds);
    bets?.forEach(b=>{ posMap[`${b.user_id}:${b.outcome_id||'x'}`]=true; posMap[`${b.user_id}:any`]=true; });
  }
  const tops=(rows||[]).filter(c=>!c.parent_id).reverse();
  const childrenOf={}; (rows||[]).forEach(c=>{ if(c.parent_id)(childrenOf[c.parent_id]||=[]).push(c); });
  Object.values(childrenOf).forEach(a=>a.sort((x,y)=>new Date(x.created_at)-new Date(y.created_at)));
  CMT_DATA={tops,childrenOf,profs,likeAgg,myLikes,posMap};
  renderComments(body);
}

function renderComments(body){
  const { tops, childrenOf, profs, likeAgg, myLikes, posMap } = CMT_DATA;
  const nick=uid=>profs[uid]?.nickname||'익명';
  const multi=isMulti();

  const cmtHtml=(c,isReply,topId)=>{
    const liked=myLikes.has(c.id);
    const isHolder=!!(posMap?.[`${c.user_id}:${c.outcome_id||'x'}`]||posMap?.[`${c.user_id}:any`]);
    const chipStyle=multi?` style="${ocChipStyle(c.side,c.outcome_id)}"`:'';
    const borderStyle=multi?` style="border-left-color:${c.outcome_id?ocColor(c.outcome_id):'#8b8b93'}"`:'';
    const roleBadge=isHolder?`<span class="pmd-cmt-role holder">💰 참여자</span>`:`<span class="pmd-cmt-role watch">👁 관전</span>`;
    const mine=c.user_id&&ME&&c.user_id===ME.id;
    const cmtMenu=mine?`<button class="cmt-mini" data-cmt-menu data-cmt-table="market_comments" data-cmt-id="${c.id}" data-cmt-uid="${c.user_id}" data-cmt-bodycol="content" aria-label="더보기">⋯</button>`:'';
    // 👻 유령 댓글: 고정 페르소나 (프로필 불연결)
    const gh = c.is_anonymous && window.GALLA_ghost ? window.GALLA_ghost(c.ghost_seed) : null;
    const nameHtml = gh
      ? `<span class="pmd-cmt-name ghost-nick" style="color:${gh.color}">${gh.avatarHTML} ${gh.name}</span>`
      : (c.user_id && window.GALLA_userBadge
        ? window.GALLA_userBadge(c.user_id, nick(c.user_id))   // 아바타+닉+레벨, 탭=유저시트
        : `<span class="pmd-cmt-name">${esc(nick(c.user_id))}</span>`);
    return `<div class="pmd-cmt ${c.side} ${isReply?'reply':''}" data-cmt-item data-id="${c.id}" data-top="${topId}" data-author="${esc(gh?gh.name:nick(c.user_id))}"${borderStyle}>
      <div class="pmd-cmt-head">
        <span class="pmd-side-chip ${c.side}"${chipStyle}>${cmtSideLabel(c.side,c.outcome_id)}</span>
        ${nameHtml}
        ${roleBadge}
        <span class="pmd-cmt-time">${ago(c.created_at)}</span>
        ${cmtMenu}
      </div>
      <div class="pmd-cmt-body" data-cmt-text data-cmt-kind="predict" data-cmt-id="${c.id}" data-cmt-locale="${c.locale || 'ko'}">${cmtBody(c.content)}</div>
      <div class="pmd-cmt-actions">
        <button class="pmd-cmt-like ${liked?'on':''}" data-id="${c.id}">♥ <span>${likeAgg[c.id]||0}</span></button>
        <button class="pmd-cmt-reply" data-id="${c.id}">답글</button>
      </div>
    </div>`;
  };
  const renderThread=(c)=>{
    const kids=childrenOf[c.id]||[];
    const expanded=CMT_EXPANDED.has(c.id);
    let repliesBlock='';
    if(kids.length){
      repliesBlock=expanded
        ?`<div class="pmd-cmt-replies">${kids.map(k=>cmtHtml(k,true,c.id)).join('')}</div>
          <button class="pmd-reply-toggle" data-top="${c.id}" data-act="collapse">답글 숨기기 ▴</button>`
        :`<button class="pmd-reply-toggle" data-top="${c.id}" data-act="expand">${kids.length}개 답글 보기 ▾</button>`;
    }
    return `<div class="pmd-cmt-thread">${cmtHtml(c,false,c.id)}${repliesBlock}
      <div class="pmd-cmt-replybox" id="replybox-${c.id}" hidden></div></div>`;
  };

  const shown=tops.slice(0,CMT_TOP_LIMIT);
  const remaining=tops.length-shown.length;
  const pickName=(p)=>{ if(p==null)return ''; if(!multi)return cmtSideName(p); if(p==='etc')return '기타'; return ocLabel(Number(p)); };

  let composeTop;
  const my=STATE?.my_bets||{};
  if(MY_POS_SIDE&&!multi){
    const myOid=Object.keys(my).find(k=>Number(my[k])>0);
    composeTop=myOid
      ? `<div class="pmd-cmt-locked ${MY_POS_SIDE}">
          💰 내 예측: <b>${esc(ocLabel(myOid))} ${fmt(my[myOid])}GP</b> —
          <b>${cmtSideName(MY_POS_SIDE)} 입장</b>으로 작성됩니다</div>`
      : `<div class="pmd-cmt-locked ${MY_POS_SIDE}">
          ✍️ 내 입장: <b>${cmtSideName(MY_POS_SIDE)}</b> — 이 입장으로 계속 작성됩니다
          <span class="pmd-cmt-ask-sub">(한 예측엔 한 입장)</span></div>`;
  } else if(multi){
    if(CMT_SIDE==null) CMT_SIDE=OUTCOMES[0]?String(OUTCOMES[0].id):null;
    const chips=OUTCOMES.map(o=>{
      const on=String(CMT_SIDE)===String(o.id);
      const c=ocColor(o.id);
      const st=on?`background:${c}22;border-color:${c};color:${c}`:'';
      return `<button class="pmd-cmt-pick ${on?'active':''}" data-pick="${o.id}" data-haptic="vote" style="${st}">🎯 ${esc(o.label)}</button>`;
    }).join('');
    composeTop=`<div class="pmd-cmt-ask">✍️ 어느 결과에 대한 의견인가요?</div><div class="pmd-cmt-picksel">${chips}</div>`;
  } else {
    composeTop=`<div class="pmd-cmt-ask">✍️ 어느 입장으로 의견을 남길까요? <span class="pmd-cmt-ask-sub">(참여하면 자동으로 고정돼요)</span></div>
      <div class="pmd-cmt-picksel">
        <button class="pmd-cmt-pick yes ${CMT_SIDE==='yes'?'active':''}" data-pick="yes" data-haptic="vote">👍 ${cmtSideName('yes')}</button>
        <button class="pmd-cmt-pick no ${CMT_SIDE==='no'?'active':''}" data-pick="no" data-haptic="vote">👎 ${cmtSideName('no')}</button>
      </div>`;
  }

  body.innerHTML=`
    <div class="pmd-cmt-compose ${CMT_SIDE!=null?'has-pick':'side-none'}">
      ${composeTop}
      <div class="pmd-cmt-inputrow">
        <input id="cmtInput" class="pmd-cmt-input" maxlength="300"
          placeholder="${CMT_SIDE!=null?`[${esc(pickName(CMT_SIDE))}] 의견을 남기세요…`:(multi?'먼저 결과를 선택하세요':'먼저 입장을 선택하세요')}">
        <button type="button" class="ghost-toggle sm" id="pmd-ghost" title="유령으로 활동"><span class="gt-ic">👻</span></button>
        <button id="cmtSend" class="pmd-cmt-send">게시</button>
      </div>
    </div>
    <div class="pmd-cmt-list">
      ${tops.length?shown.map(renderThread).join(''):emptyTab('첫 의견을 남겨보세요!')}
    </div>
    ${remaining>0?`<button id="cmtMore" class="pmd-cmt-more">댓글 더 보기 (${remaining})</button>`:''}`;

  window.GALLA_ghostBind && window.GALLA_ghostBind($('pmd-ghost'));
  body.querySelectorAll('.pmd-cmt-compose .pmd-cmt-pick').forEach(b=>b.addEventListener('click',async ()=>{
    // 로그인 필수 — 미로그인은 입장 선택 자체를 막고 로그인으로 유도
    if(window.GALLA_requireLogin){ if(!(await window.GALLA_requireLogin('의견 참여는 로그인 후 가능해요.'))) return; }
    else if(needLogin()) return;
    CMT_SIDE=b.dataset.pick;
    body.querySelectorAll('.pmd-cmt-compose .pmd-cmt-pick').forEach(x=>{ x.classList.remove('active'); if(multi)x.style.cssText=''; });
    b.classList.add('active');
    if(multi){ const c=ocColor(b.dataset.pick); b.style.cssText=`background:${c}22;border-color:${c};color:${c}`; }
    body.querySelector('.pmd-cmt-compose')?.classList.add('has-pick');
    const inp=$('cmtInput'); inp.placeholder=`[${pickName(CMT_SIDE)}] 의견을 남기세요…`; inp.focus();
  }));
  $('cmtSend').addEventListener('click',()=>{
    if(CMT_SIDE==null){
      const sel=body.querySelector('.pmd-cmt-picksel');
      sel?.classList.add('shake'); setTimeout(()=>sel?.classList.remove('shake'),500);
      toast(multi?'먼저 결과를 선택해주세요.':'먼저 입장을 선택해주세요.'); return;
    }
    postComment($('cmtInput').value,CMT_SIDE,null,body);
  });
  $('cmtMore')?.addEventListener('click',()=>{ CMT_TOP_LIMIT+=10; renderComments(body); });
  body.querySelectorAll('.pmd-reply-toggle').forEach(b=>b.addEventListener('click',()=>{
    const id=Number(b.dataset.top);
    if(b.dataset.act==='expand') CMT_EXPANDED.add(id); else CMT_EXPANDED.delete(id);
    renderComments(body);
  }));
  body.querySelectorAll('.pmd-cmt-like').forEach(b=>b.addEventListener('click',async ()=>{
    if(needLogin())return;
    const id=Number(b.dataset.id); const on=b.classList.contains('on');
    const span=b.querySelector('span'); let n=Number(span.textContent);
    if(on){ await supa.from('market_comment_likes').delete().eq('comment_id',id).eq('user_id',ME.id); b.classList.remove('on'); span.textContent=Math.max(0,n-1); CMT_DATA.likeAgg[id]=(CMT_DATA.likeAgg[id]||1)-1; CMT_DATA.myLikes.delete(id); }
    else { const {error}=await supa.from('market_comment_likes').insert({comment_id:id,user_id:ME.id}); if(!error){ b.classList.add('on'); span.textContent=n+1; CMT_DATA.likeAgg[id]=(CMT_DATA.likeAgg[id]||0)+1; CMT_DATA.myLikes.add(id); } }
  }));
  body.querySelectorAll('.pmd-cmt-reply').forEach(b=>b.addEventListener('click',()=>{
    if(needLogin())return;
    const cmtEl=b.closest('.pmd-cmt');
    const topId=Number(cmtEl.dataset.top);
    const author=cmtEl.dataset.author;
    CMT_EXPANDED.add(topId);
    if(!$('replybox-'+topId)) renderComments(body);
    const box=$('replybox-'+topId);
    box.hidden=false;
    box.innerHTML=`<div class="pmd-cmt-inputrow reply">
      <input class="pmd-cmt-input reply-input" maxlength="300" value="@${author} " placeholder="답글 달기…">
      <button class="pmd-cmt-send reply-send">게시</button></div>`;
    const inp=box.querySelector('.reply-input'); inp.focus(); inp.setSelectionRange(inp.value.length,inp.value.length);
    box.querySelector('.reply-send').addEventListener('click',()=>{
      if(CMT_SIDE==null){ toast('먼저 상단에서 입장을 선택해주세요.'); return; }
      postComment(inp.value,CMT_SIDE,topId,body);
    });
    box.scrollIntoView({block:'nearest',behavior:'smooth'});
  }));
}

async function postComment(text,pick,parentId,body){
  if(needLogin())return;
  const txt=(text||'').trim();
  if(!txt||txt.startsWith('@')&&txt.replace(/^@\S+\s*/,'').length===0)return toast('의견을 입력하세요.');
  const ghostBtn=$('pmd-ghost');
  const payload={market_id:marketId,user_id:ME.id,content:txt,
    is_anonymous: ghostBtn?.classList.contains('on')===true};
  if(parentId) payload.parent_id=parentId;
  if(!isMulti()){
    payload.side=pick;
    const o=OUTCOMES.find(x=>sideOf(x)===pick);
    if(o) payload.outcome_id=o.id;
  } else { payload.side='yes'; payload.outcome_id=Number(pick)||OUTCOMES[0]?.id; }
  const { error } = await supa.from('market_comments').insert(payload);
  if(error){
    if(window.GALLA_ghostInsertError && window.GALLA_ghostInsertError(error, ghostBtn)) return;
    console.error('[cmt] insert',error); return toast('등록 실패');
  }
  (window.GALLA_toast || toast)(parentId ? '💬 답글이 등록됐어요' : '💬 댓글이 등록됐어요');
  loadComments(body);
}

/* ============ SPA 페이지 훅 ============
   초기화 로직은 위의 initPredictMarket 그대로 — 여기서는 감싸기만 한다.
   MPA 단독 문서에서는 존재만 하고 아무도 안 부르므로 동작 불변. */
window.GALLA_PAGE_PREDICT_MARKET = {
  _root: null,
  mount(root, params){
    this._root = root || document;
    return initPredictMarket(this._root, params || {});
  },
  unmount(){
    if (LIVE_TIMER) { clearInterval(LIVE_TIMER); LIVE_TIMER = null; }
    MARKET = null;           // 잔여 콜백 no-op 보장
    this._root = null;
    D = document;
  },
  scrolltop(){
    const sc = (this._root && this._root !== document) ? this._root : (document.scrollingElement || document.documentElement);
    try { sc.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) { sc.scrollTop = 0; }
  },
};
})();
