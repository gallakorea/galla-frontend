/* =========================================================
   galla-predict.js — 갈라예측 아케이드 로비 (파리뮤추얼)
   오늘의 대박 보너스 · 연승 콤보 · 데일리 무료코인 · 실시간 리턴 카드
========================================================= */
let supa = null, ME = null;
let allMarkets = [], OUT_BY_M = {}, curCat = '', curSort = 'volume';
let MY_STREAK = 0;

const $ = id => document.getElementById(id);
let predPreImageUrl = null;   // 🖼 갈비스가 만든 예측 커버(사전호스팅 R2 url) — 파일 업로드 없이 그대로
/* 🔖 해시태그 공용 헬퍼(가드) — 전용칸 + 질문/설명 #태그 자동추출을 tags[]로. */
if (!window.GALLA_collectTags) {
  window.GALLA_extractHashtags = t => { const o=[]; (String(t||'').match(/#([0-9A-Za-z가-힣_]{1,30})/g)||[]).forEach(m=>{const x=m.slice(1).toLowerCase(); if(x&&!o.includes(x))o.push(x);}); return o; };
  window.GALLA_parseTagInput = v => { const o=[]; String(v||'').split(/[\s,]+/).forEach(s=>{const x=s.replace(/[^0-9A-Za-z가-힣_]/g,'').toLowerCase(); if(x&&x.length<=30&&!o.includes(x))o.push(x);}); return o; };
  window.GALLA_collectTags = (inp,...txt)=>{ const o=[]; const add=x=>{if(x&&!o.includes(x))o.push(x);}; window.GALLA_parseTagInput(inp).forEach(add); txt.forEach(tx=>window.GALLA_extractHashtags(tx).forEach(add)); return o.slice(0,10); };
}
// 🚀 상세 이동 — SPA 셸(app.html)이면 스택 push(문서 유지 → 스플래시 안 뜸), MPA면 기존 location 이동.
//    예전엔 location.href로 predict-market.html을 직접 열어 SPA를 떠나며 그 페이지의 splash-boot 스플래시가 번쩍였다.
function goDetail(url){
  if (window.GALLA_SPA && window.GALLA_SPA.push) {
    const m = String(url).match(/^\.?\/?([a-z0-9_-]+)\.html(?:\?([^#]*))?/i);
    if (m) { const p = {}; if (m[2]) new URLSearchParams(m[2]).forEach((v, k) => p[k] = v); window.GALLA_SPA.push(m[1], p); return; }
  }
  location.href = url;
}
function toast(msg){
    try { if (window.GALLA_t) msg = window.GALLA_t(msg); } catch (e) {}
    const t=$('pmToast'); t.textContent=msg; t.hidden=false; clearTimeout(t._t); t._t=setTimeout(()=>t.hidden=true,2200); }
function fmt(n){ return Math.round(Number(n)||0).toLocaleString('ko-KR'); }
// 헤더 포인트 알약용 축약 — 금액이 커져도 폭이 안 늘어 로고를 밀거나 겹치지 않게(사장님 요청).
//   10만 미만: 정확히(99,999) / 1억 미만: 만 단위(99.2만) / 그 이상: 억 단위(1.2억)
function fmtCompact(n){
  n = Math.max(0, Math.floor(Number(n)||0));
  if (n < 100000) return n.toLocaleString('ko-KR');
  if (n < 100000000){ const m=n/10000; return (m>=100?Math.round(m):(Math.round(m*10)/10))+'만'; }
  const e=n/100000000; return (e>=100?Math.round(e):(Math.round(e*10)/10))+'억';
}
function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function comboMult(n){ return n>=10?2.5:n>=5?1.8:n>=3?1.4:n>=2?1.2:1; }
function timeLeft(c){
  const ms=new Date(c)-Date.now();
  if(ms<=0) return '마감';
  const d=Math.floor(ms/86400000); if(d>=1) return `D-${d}`;
  const h=Math.floor(ms/3600000); if(h>=1) return `${h}시간`;
  return `${Math.max(1,Math.floor(ms/60000))}분`;
}
function oddsOf(m, o){ const p=o.pool_gp||0; return p>0 ? ((m.total_pool||0)+(m.jackpot_bonus||0))/p : null; }

/* ============ init ============ */
async function initPredictPage(){
  supa = await waitForSupabaseClient();
  const { data } = await supa.auth.getSession();
  ME = data?.session?.user || null;
  await refreshBalance();
  await loadMyStreak();
  bindUI();
  await loadMarkets();
}
/* 이중 모드 — MPA(단독 문서, body data-page≠'spa')면 기존처럼 자동 초기화.
   SPA(app.html)면 어댑터(js/spa/views/predict.js)가 GALLA_PAGE_PREDICT.mount()를 부를 때까지 대기. */
if (!(document.body && document.body.dataset.page === 'spa')) {
  document.addEventListener('DOMContentLoaded', initPredictPage);
}

let MY_POINTS = 0;
async function refreshBalance(){
  if(!ME){ const p=$('pointPill'); if(p) p.hidden=true; return; }
  const p=$('pointPill'); if(p) p.hidden=false;
  const { data, error } = await supa.rpc('ensure_balance');
  if(!error && data!=null){ MY_POINTS=data; const pb=$('pointBalance'); if(pb){ pb.textContent=fmtCompact(data)+'P'; pb.title=fmt(data)+'P'; } }
}
async function loadMyStreak(){
  if(!ME){ MY_STREAK=0; return; }
  const { data } = await supa.from('predict_streaks').select('current').eq('user_id', ME.id).maybeSingle();
  MY_STREAK = data?.current || 0;
}

/* ============ 놀이 안내 (어떻게 돌아가요?) ============ */
const GUIDE_KEY='galla_predict_guide_seen';
function renderGuide(){
  const el=$('pmGuide'); if(!el) return;
  const seen=localStorage.getItem(GUIDE_KEY)==='1';
  el.innerHTML=`
  <div class="pg ${seen?'':'open'}" id="pgBox">
    <button class="pg-head" id="pgToggle">
      <span class="pg-head-ic">🎡</span>
      <span class="pg-head-t">갈라예측, 어떻게 돌아가요?</span>
      <span class="pg-head-arrow">${seen?'▾':'▴'}</span>
    </button>
    <div class="pg-body">
      <div class="pg-steps">

        <div class="pg-step">
          <div class="pg-art">
            <span class="pg-art-main">🤔</span>
            <span class="pg-art-side l">👍</span>
            <span class="pg-art-side r">👎</span>
          </div>
          <div class="pg-n">1</div>
          <div class="pg-t">한쪽을 고르고 GP를 싣는다</div>
          <div class="pg-s">"이번 주 비 올까?" 예 또는 아니오에 GP를 실어보세요.
            한 예측엔 <b>한 편만</b> 들 수 있어요. 최소 10GP.</div>
        </div>
        <div class="pg-arrow">▼</div>

        <div class="pg-step">
          <div class="pg-art">
            <span class="pg-art-main">🍯</span>
            <span class="pg-coin c1">🪙</span><span class="pg-coin c2">🪙</span><span class="pg-coin c3">🪙</span>
          </div>
          <div class="pg-n">2</div>
          <div class="pg-t">모두의 GP가 한 항아리에 모인다</div>
          <div class="pg-s">양쪽 참여 GP가 전부 <b>하나의 상금풀</b>이 돼요.
            내 편에 사람이 적을수록 리턴 <b>×N</b>이 커집니다 — 소수파의 짜릿함!
            리턴 배수는 실시간으로 움직여요.</div>
        </div>
        <div class="pg-arrow">▼</div>

        <div class="pg-step">
          <div class="pg-art"><span class="pg-art-main">⏰</span><span class="pg-art-side r">🏁</span></div>
          <div class="pg-n">3</div>
          <div class="pg-t">마감되면 자동으로 정산</div>
          <div class="pg-s">시간이 끝나면 <b>AI 심판이 실제 뉴스를 근거로 정답을 자동 확정</b>해요
            (이게 '정산'!). 판정이 애매하면 무리하게 정하지 않고 <b>전액 환불</b>됩니다.
            정산되면 알림이 와요 🔔</div>
        </div>
        <div class="pg-arrow">▼</div>

        <div class="pg-step win">
          <div class="pg-art"><span class="pg-art-main">🏆</span><span class="pg-coin c1">💰</span><span class="pg-coin c3">✨</span></div>
          <div class="pg-n">4</div>
          <div class="pg-t">맞힌 사람들이 항아리를 나눠 갖는다</div>
          <div class="pg-s">상금풀 <b>전체</b>를 적중자끼리 건 만큼 비율로 분배!
            틀리면 건 GP는 안녕… 아무도 못 맞히면 <b>전액 환불</b>이라 안심.</div>
        </div>

      </div>
      <div class="pg-bonus">
        <div class="pg-bonus-row">🔥 <b>연승 콤보</b> — 연속으로 맞힐수록 보너스 배수! 2연승 ×1.2 … 10연승 ×2.5</div>
        <div class="pg-bonus-row">🎁 <b>오늘의 보너스 매치</b> — 매일 한 예측에 갈라가 보너스 GP를 얹어드려요</div>
        <div class="pg-bonus-row">🪙 <b>무료 코인</b> — 출석만 해도 예측에 쓸 GP를 매일 드립니다. 현금 아님, 부담 제로!</div>
        <div class="pg-bonus-row" style="opacity:.7">ℹ️ GP는 현금 가치가 없으며 환전·양도·매매할 수 없는 놀이용 포인트입니다.</div>
      </div>
      <div class="pg-ex">
        예시) 상금풀 10,000GP · 예 8,000 vs 아니오 2,000<br>
        → '아니오'에 1,000GP 걸고 적중하면 <b>내 몫 = 1,000/2,000 × 10,000 = 5,000GP</b> 🎉
      </div>
    </div>
  </div>`;
  $('pgToggle').onclick=()=>{
    const box=$('pgBox');
    const opening=!box.classList.contains('open');
    box.classList.toggle('open',opening);
    box.querySelector('.pg-head-arrow').textContent=opening?'▴':'▾';
    localStorage.setItem(GUIDE_KEY,'1');
    if(opening&&window.GALLA_FX){ const r=$('pgToggle').getBoundingClientRect(); window.GALLA_FX.burst(r.left+30,r.top+r.height/2,{emojis:['🎡','✨'],count:8,spread:46}); }
  };
  if(!seen) localStorage.setItem(GUIDE_KEY,'1');
}

/* ============ 몰입 배너 ============ */
function renderCombo(){
  const el=$('pmCombo'); if(!el) return;
  const next = comboMult(MY_STREAK+1);
  if(MY_STREAK>=1){
    el.innerHTML=`<div class="pm-combo hot">
      <span class="pm-combo-fire">🔥</span>
      <span class="pm-combo-txt">
        <span class="pm-combo-n">${MY_STREAK}연승 진행 중!</span>
        <span class="pm-combo-sub">다음 적중 시 콤보 보너스 <b>×${next}</b> 적용</span>
      </span>
      <span class="pm-combo-mult">×${next}</span>
    </div>`;
  } else {
    el.innerHTML=`<div class="pm-combo">
      <span class="pm-combo-fire">🎯</span>
      <span class="pm-combo-txt">
        <span class="pm-combo-n">연승 콤보에 도전하세요</span>
        <span class="pm-combo-sub">연속 적중할수록 배수 보너스가 커집니다 (최대 ×2.5)</span>
      </span>
    </div>`;
  }
}
function renderDaily(){
  const el=$('pmDaily'); if(!el) return;
  el.innerHTML=`<div class="pm-daily" id="pmDailyBtn">
    <span class="pm-daily-ic">🪙</span>
    <span class="pm-daily-m"><span class="pm-daily-t">오늘의 무료 코인</span>
      <span class="pm-daily-s">출석하고 예측에 쓸 GP를 받으세요 · 연속 출석 보너스</span></span>
    <span class="pm-daily-go">받기 ›</span>
  </div>`;
  $('pmDailyBtn').onclick = claimDaily;
}
async function claimDaily(){
  if(!ME){ (window.GALLA_nav||function(u){location.href=u})('login.html'); return; }
  const { data, error } = await supa.rpc('claim_daily');
  if(error) return toast('오류가 발생했습니다.');
  const btn=$('pmDailyBtn');
  if(data.ok){
    const jackpot = (data.day_in_week||1)===7 ? ' 🎉 7일 보너스!' : '';
    toast(`🔥 ${data.streak}일 연속 출석! +${fmt(data.claimed)}P${jackpot}`);
    { const pb=$('pointBalance'); if(pb){ pb.textContent=fmtCompact(data.balance)+'P'; pb.title=fmt(data.balance)+'P'; } } MY_POINTS=data.balance;
    if(window.GALLA_FX){ const r=btn.getBoundingClientRect(); window.GALLA_FX.burst(r.left+30,r.top+r.height/2,{emojis:['🪙','✨','💰'],count:12,spread:60}); }
    btn.classList.add('done'); btn.querySelector('.pm-daily-go').textContent='완료';
    btn.onclick=null;
  } else if(data.reason==='already'){
    toast('오늘 출석 코인은 이미 받았어요.');
    btn.classList.add('done'); btn.querySelector('.pm-daily-go').textContent='완료'; btn.onclick=null;
  }
}
function renderJackpot(){
  const el=$('pmJackpot'); if(!el) return;
  const open = allMarkets.filter(m=>!m.resolved && new Date(m.close_at)>Date.now());
  if(!open.length){ el.innerHTML=''; return; }
  // 보너스 지정 우선, 없으면 상금풀(총풀+보너스) 최대
  let hero = open.find(m=>m.is_jackpot);
  const prize = m => (m.total_pool||0)+(m.jackpot_bonus||0);
  if(!hero){ hero = open.slice().sort((a,b)=>prize(b)-prize(a))[0]; }
  const outs = OUT_BY_M[hero.id]||[];
  el.innerHTML=`<div class="pm-jackpot" data-id="${hero.id}">
    <div class="pm-jp-top">
      <span class="pm-jp-badge">${hero.is_jackpot?'🎁 오늘의 보너스 매치':'🔥 지금 가장 뜨거운'}</span>
      <span class="pm-jp-timer">⏳ ${timeLeft(hero.close_at)} 남음</span>
    </div>
    <div class="pm-jp-q">${esc(hero.question)}</div>
    <div class="pm-jp-pool">
      <div class="pm-jp-pool-lbl">${hero.jackpot_bonus>0?'보너스 포함 상금풀':'현재 상금풀'}</div>
      <div class="pm-jp-pool-n" data-to="${Math.round(prize(hero))}">0<small> GP</small></div>
    </div>
    ${oddsBar(hero, outs)}
    <button class="pm-jp-go">지금 예측하기 →</button>
  </div>`;
  el.querySelector('.pm-jackpot').onclick=()=>goDetail(`predict-market.html?id=${hero.id}`);
  countUp(el);
}

/* 오즈 바 (예 vs 아니오) */
function oddsBar(m, outs){
  const yes = outs.find(o=>o.label==='예')||outs[0];
  const no  = outs.find(o=>o.label==='아니오')||outs[1];
  if(!yes||!no) return '';
  const py=yes.pool_gp||0, pn=no.pool_gp||0, tot=py+pn;
  const yp = tot>0 ? Math.round(py/tot*100) : 50;
  const oy=oddsOf(m,yes), on=oddsOf(m,no);
  return `<div class="pm-odds">
    <div class="pm-odds-bar">
      <div class="pm-odds-side yes" style="width:${Math.max(16,Math.min(84,yp))}%"><span class="lab">예 ${yp}%</span></div>
      <div class="pm-odds-side no" style="width:${Math.max(16,Math.min(84,100-yp))}%"><span class="lab">아니오 ${100-yp}%</span></div>
    </div>
    <div class="pm-odds-mult">
      <span class="y">예 적중 시 <b>×${oy?oy.toFixed(2):'–'}</b></span>
      <span class="n"><b>×${on?on.toFixed(2):'–'}</b> 아니오 적중 시</span>
    </div>
  </div>`;
}

/* 숫자 카운트업 */
function countUp(root){
  if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches){
    root.querySelectorAll('[data-to]').forEach(el=>el.firstChild&&(el.firstChild.textContent=fmt(el.dataset.to))); return;
  }
  root.querySelectorAll('[data-to]').forEach(el=>{
    const to=+el.dataset.to||0, t0=performance.now(), dur=900;
    (function tick(t){ const k=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-k,3);
      const small=el.querySelector('small'); el.childNodes[0].textContent=fmt(Math.round(to*e));
      if(k<1) requestAnimationFrame(tick); })(t0);
  });
}

/* ============ 마켓 로드/렌더 ============ */
async function loadMarkets(){
  // 🌍 읽기 필터 — 내 언어 + global 마켓. 언어가 하나뿐이면 no-op.
  const { data, error } = await (window.GALLA_lfilter || function (q) { return q; })(supa.from('markets')
    .select('id,question,category,image_url,close_at,resolved,resolved_outcome_id,is_jackpot,jackpot_bonus,total_pool,volume,created_at,created_by')
    .order('created_at',{ascending:false}));
  if(error){ console.error(error); return; }
  allMarkets = data||[];
  // 예언자(작성자) 배지용 프로필 프리페치
  if(window.GALLA_userMap) await window.GALLA_userMap(allMarkets.map(m=>m.created_by));
  OUT_BY_M={};
  const ids=allMarkets.map(m=>m.id);
  if(ids.length){
    const { data:outs } = await supa.from('market_outcomes')
      .select('id,market_id,label,pool_gp,bettor_count,sort_order,is_winner').in('market_id',ids);
    (outs||[]).forEach(o=>(OUT_BY_M[o.market_id]||=[]).push(o));
    Object.values(OUT_BY_M).forEach(a=>a.sort((x,y)=>x.sort_order-y.sort_order));
  }
  await loadReactionsAndSaves(ids);
  renderGuide(); renderCombo(); renderDaily(); renderJackpot(); renderMarkets();
}

let RX_AGG={}, MY_RX={}, MY_SAVED={};
async function loadReactionsAndSaves(ids){
  RX_AGG={}; MY_RX={}; MY_SAVED={}; if(!ids.length) return;
  const [rx,myrx,sv]=await Promise.all([
    supa.from('market_reactions').select('market_id,value').in('market_id',ids),
    ME?supa.from('market_reactions').select('market_id,value').eq('user_id',ME.id).in('market_id',ids):Promise.resolve({data:[]}),
    ME?supa.from('market_bookmarks').select('market_id').eq('user_id',ME.id).in('market_id',ids):Promise.resolve({data:[]}),
  ]);
  (rx.data||[]).forEach(r=>{ const a=RX_AGG[r.market_id]||={up:0,down:0}; if(r.value===1)a.up++; else a.down++; });
  (myrx.data||[]).forEach(r=>MY_RX[r.market_id]=r.value);
  (sv.data||[]).forEach(b=>MY_SAVED[b.market_id]=true);
}

const IC_SAVE=`<svg viewBox="0 0 24 24"><path d="M18 21l-6-4.3L6 21V5.5A2.5 2.5 0 0 1 8.5 3h7A2.5 2.5 0 0 1 18 5.5V21z"/></svg>`;
const IC_SHARE=`<svg viewBox="0 0 24 24"><path d="M21.5 2.5L10.8 13.2"/><path d="M21.5 2.5l-6.8 19-3.9-8.3-8.3-3.9 19-6.8z"/></svg>`;

function renderMarkets(){
  let list=allMarkets.slice();
  if(curCat) list=list.filter(m=>m.category===curCat);
  // 미정산(open) 먼저, 그 안에서 정렬
  const openM=list.filter(m=>!m.resolved), doneM=list.filter(m=>m.resolved);
  const sorter = (a,b)=> curSort==='new' ? new Date(b.created_at)-new Date(a.created_at)
                    : curSort==='closing' ? new Date(a.close_at)-new Date(b.close_at)
                    : (b.total_pool||0)-(a.total_pool||0);
  openM.sort(sorter); doneM.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  list=[...openM,...doneM];

  const wrap=$('marketList');
  $('marketsEmpty').hidden = list.length>0;
  wrap.innerHTML = list.map(m=>{
    const outs=OUT_BY_M[m.id]||[];
    const bettors=outs.reduce((s,o)=>s+(o.bettor_count||0),0);
    const closed=m.resolved || new Date(m.close_at)<=Date.now();
    let statusBadge;
    if(m.resolved){
      const win=outs.find(o=>o.id===m.resolved_outcome_id);
      statusBadge=`<span class="pm-badge-win">✔ ${esc(win?win.label:'정산')} 적중</span>`;
    } else if(closed){ statusBadge=`<span class="pm-card-act">⏳ 마감·정산대기</span>`; }
    else statusBadge=`<span class="pm-badge-live"><i></i>LIVE · ${timeLeft(m.close_at)}</span>`;

    return `<div class="pm-card ${m.resolved?'resolved':''}" data-id="${m.id}">
      <div class="pm-card-top">
        <div class="pm-card-thumb">${m.image_url?`<img src="${esc(m.image_url)}" loading="lazy">`:'🎯'}</div>
        <div class="pm-card-h">
          <div class="pm-card-q">${esc(m.question)}</div>
          <div class="pm-card-meta">${esc(m.category||'')} · ${statusBadge}${m.is_jackpot?' · 🎁 보너스':''}</div>
          ${m.created_by && window.GALLA_userBadge ? `<div class="pm-card-by">${window.GALLA_userBadge(m.created_by)}<span class="pm-by-tag">예언자</span></div>` : ''}
        </div>
      </div>
      ${oddsBar(m, outs)}
      <div class="pm-card-foot">
        <span class="pm-card-stats">
          <span>💰 <b>${fmt(m.total_pool)}</b>GP</span>
          <span>👥 <b>${fmt(bettors)}</b></span>
        </span>
        <span class="pm-card-stats">
          <button class="pm-card-act mc-act ${MY_SAVED[m.id]?'on':''}" data-act="save" data-id="${m.id}" aria-label="저장">${IC_SAVE}</button>
          <button class="pm-card-act mc-act" data-act="share" data-id="${m.id}" data-title="${esc(m.question)}" aria-label="공유">${IC_SHARE}</button>
          <button class="pm-card-act" data-galvis data-gv-type="predict" data-gv-id="${m.id}" data-gv-title="${esc(m.question)}" aria-label="갈비스와 얘기"><svg class="gv-galvis" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="8.2" stroke-width="1.5" stroke-dasharray="2.3 2.2"/><circle cx="12" cy="12" r="4.7" stroke-width="1.3"/><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/></svg></button>
        </span>
      </div>
    </div>`;
  }).join('');

  wrap.querySelectorAll('.pm-card').forEach(c=>{
    c.onclick=e=>{ if(e.target.closest('.mc-act')) return; goDetail(`predict-market.html?id=${c.dataset.id}`); };
  });
  bindMarketActions(wrap);
}

function bindMarketActions(wrap){
  wrap.querySelectorAll('.mc-act').forEach(btn=>{
    btn.onclick=async e=>{
      e.stopPropagation();
      const id=Number(btn.dataset.id), act=btn.dataset.act;
      if(act==='share'){
        const url=window.GALLA_shareUrl?window.GALLA_shareUrl('predict',id):new URL(`predict-market.html?id=${id}`,location.href).href;
        const stitle=btn.dataset.title?`🎯 ${btn.dataset.title}`:'GALLA 갈라예측';
        if(window.GALLA_share) return window.GALLA_share({url,title:stitle,text:'GP로 겨루는 예측 배틀, 갈라예측'});
        try{ await navigator.clipboard.writeText(url); toast('링크가 복사되었습니다.'); }catch{ toast('링크 복사 실패'); }
        return;
      }
      if(!ME){ if(confirm('로그인이 필요합니다. 로그인하시겠어요?')) (window.GALLA_nav||function(u){location.href=u})('login.html'); return; }
      btn.disabled=true;
      try{
        if(MY_SAVED[id]){ await supa.from('market_bookmarks').delete().eq('market_id',id).eq('user_id',ME.id); delete MY_SAVED[id]; }
        else{ await supa.from('market_bookmarks').insert({market_id:id,user_id:ME.id}); MY_SAVED[id]=true; }
        btn.classList.toggle('on',!!MY_SAVED[id]);
      }catch(err){ console.error(err); } finally{ btn.disabled=false; }
    };
  });
}

/* ============ UI 바인딩 ============ */
function bindUI(){
  $('pointPill')?.addEventListener('click', ()=>(window.GALLA_nav||function(u){location.href=u})('gp-history.html'));
  document.querySelectorAll('.seg-tab').forEach(t=>t.addEventListener('click',()=>{
    document.querySelectorAll('.seg-tab').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    const v=t.dataset.view;
    $('view-markets').hidden=v!=='markets'; $('view-rank').hidden=v!=='rank';
    if(v==='rank'){ renderMyTier(); loadLeaderboard('galla'); }
  }));
  document.querySelectorAll('.rank-subtab').forEach(t=>t.addEventListener('click',()=>{
    document.querySelectorAll('.rank-subtab').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    const r=t.dataset.rank;
    $('rankGalla').hidden=r!=='galla'; $('rankKing').hidden=r!=='king'; $('rankGod').hidden=r!=='god';
    loadLeaderboard(r);
  }));
  $('catChips')?.addEventListener('click',e=>{
    const chip=e.target.closest('.cat-chip'); if(!chip) return;
    document.querySelectorAll('.cat-chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active'); curCat=chip.dataset.cat; renderMarkets(); renderJackpot();
  });
  $('sortSelect')?.addEventListener('change',e=>{ curSort=e.target.value; renderMarkets(); });

  /* ---- 예측 만들기 (파리뮤추얼: 하우스 시드, 생성 무료) ---- */
  window.__openComposeModal=openCreateModal;
  window.GALLA_openCompose_predict=openCreateModal;   // SPA picker(create)가 탭 활성 후 직접 호출
  if(new URLSearchParams(location.search).get('compose')==='1') setTimeout(openCreateModal,60);
  $('createClose')?.addEventListener('click',()=>{ $('createModal').hidden=true; });
  $('createModal')?.addEventListener('click',e=>{ if(e.target.id==='createModal') $('createModal').hidden=true; });
  document.querySelectorAll('.pm-type-tab').forEach(t=>t.addEventListener('click',()=>{
    document.querySelectorAll('.pm-type-tab').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    window.__NEW_TYPE__=t.dataset.type;
    $('mOutcomesWrap').hidden=t.dataset.type!=='multi';
    if(t.dataset.type==='multi'&&$('mOutcomes').children.length===0){ addOutcomeRow(); addOutcomeRow(); }
  }));
  $('mAddOutcome')?.addEventListener('click',()=>{
    if($('mOutcomes').children.length>=8) return toast('최대 8개까지 가능합니다.');
    addOutcomeRow();
  });
  $('mImage')?.addEventListener('change',e=>{
    const f=e.target.files[0];
    $('mImagePreview').innerHTML=f?`<img src="${URL.createObjectURL(f)}">`:'';
  });
  $('createSubmit')?.addEventListener('click',submitMarket);
}

let __predDraft=null;
function openCreateModal(){
  // ME(로그인 유저)가 탭 마운트 직후엔 아직 비어있을 수 있다(비동기 auth) — picker에서 바로 들어오면
  // 잠깐 재시도 후에도 없으면 그때 로그인 유도(문서이탈 없이 SPA는 스택 push). '피드로 튐' 방지.
  if(!ME){
    openCreateModal._t=(openCreateModal._t||0)+1;
    if(openCreateModal._t<=20) return setTimeout(openCreateModal,120);
    openCreateModal._t=0;
    if(confirm('로그인이 필요합니다. 로그인하시겠어요?')){
      if(document.body&&document.body.dataset.page==='spa'&&window.GALLA_SPA) window.GALLA_SPA.push('login');
      else (window.GALLA_nav||function(u){location.href=u})('login.html');
    }
    return;
  }
  openCreateModal._t=0;
  predPreImageUrl=null;   // 새 모달 열 때 갈비스 커버 초기화
  const d=new Date(Date.now()+7*86400000);
  d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
  $('mCloseAt').value=d.toISOString().slice(0,16);
  $('createModal').hidden=false;   // composer-page(웹·앱 공용)가 전체화면 페이지화 + 뒤로가기 처리
  // 공용 임시저장 — 예측 질문·설명·카테고리 복원
  if(!__predDraft && window.GALLA_draft) __predDraft=window.GALLA_draft('predict',['mQuestion','mDesc','mCategory']);
  if(__predDraft) __predDraft.restore();
  // 🤖 갈비스 예측 초안 프리필 + 🛠 작업모드 브리지
  try{
    const seed=JSON.parse(sessionStorage.getItem('GALLA_SEED')||'null');
    if(seed && seed.from==='jarvis' && seed.kind==='predict'){
      sessionStorage.removeItem('GALLA_SEED');
      if($('mQuestion')&&!$('mQuestion').value) $('mQuestion').value=seed.question||'';
      if($('mDesc')&&!$('mDesc').value) $('mDesc').value=seed.description||'';
      if(seed.category && $('mCategory')){ try{ $('mCategory').value=seed.category; }catch(_){} }
      if(seed.closeDays>0 && $('mCloseAt')){ const cd=new Date(Date.now()+seed.closeDays*86400000); cd.setMinutes(cd.getMinutes()-cd.getTimezoneOffset()); $('mCloseAt').value=cd.toISOString().slice(0,16); }
    }
  }catch(_){}
  exposePredictWorkform();
}
// 🛠 작업 모드 브리지 — 갈비스가 예측 초안(질문·정산기준·카테고리·마감)을 실시간 수정
function exposePredictWorkform(){
  const setVal=(elm,v)=>{ if(!elm||v==null) return; elm.value=String(v); try{ elm.dispatchEvent(new Event('input',{bubbles:true})); }catch(_){}};
  window.GALLA_WORKFORM={
    type:'predict',
    getFields(){ return { question: $('mQuestion')?$('mQuestion').value:'', description: $('mDesc')?$('mDesc').value:'', category: $('mCategory')?$('mCategory').value:'' }; },
    setFields(f){ if(!f) return;
      if('question' in f) setVal($('mQuestion'), f.question);
      if('description' in f) setVal($('mDesc'), f.description);
      if('category' in f && f.category){ try{ $('mCategory').value=f.category; }catch(_){} }
      if(f.close_days>0 && $('mCloseAt')){ const cd=new Date(Date.now()+f.close_days*86400000); cd.setMinutes(cd.getMinutes()-cd.getTimezoneOffset()); setVal($('mCloseAt'), cd.toISOString().slice(0,16)); }
    },
    // 🖼 갈비스 AI 썸네일 → 예측 커버 이미지로(사전호스팅, 업로드 스킵)
    setThumbnail(url){
      if(!url) return;
      predPreImageUrl=url;
      const p=$('mImagePreview'); if(p) p.innerHTML=`<img src="${url}">`;
    },
    submit(){ const b=$('createSubmit'); if(b && !b.disabled) b.click(); },
    summary(){ return '질문:'+String(($('mQuestion')&&$('mQuestion').value)||'-').slice(0,40); }
  };
}
function addOutcomeRow(val=''){
  const row=document.createElement('div');
  row.className='pm-outcome-row';
  row.innerHTML=`<input class="pm-input pm-outcome-input" maxlength="30" placeholder="선택지 이름" value="${val}">
    <button type="button" class="pm-outcome-del">✕</button>`;
  row.querySelector('.pm-outcome-del').addEventListener('click',()=>{
    if($('mOutcomes').children.length<=2) return toast('최소 2개는 필요합니다.');
    row.remove();
  });
  $('mOutcomes').appendChild(row);
}
async function submitMarket(){
  const q=$('mQuestion').value.trim();
  const closeAt=$('mCloseAt').value;
  const type=window.__NEW_TYPE__||'binary';
  if(!q) return toast('질문을 입력하세요.');
  if(!closeAt) return toast('마감 일시를 선택하세요.');
  if(new Date(closeAt)<=new Date()) return toast('마감은 미래 시각이어야 합니다.');
  let outcomes=null;
  if(type==='multi'){
    const labels=[...document.querySelectorAll('.pm-outcome-input')].map(i=>i.value.trim()).filter(Boolean);
    if(labels.length<2) return toast('선택지를 2개 이상 입력하세요.');
    outcomes=labels.map(l=>({label:l}));
  }
  const btn=$('createSubmit');
  btn.disabled=true; btn.textContent='만드는 중…';
  try{
    let imageUrl=predPreImageUrl;   // 🖼 갈비스가 만든 커버가 있으면 그걸(업로드 없이)
    const f=$('mImage').files[0];
    if(!imageUrl && f){ btn.textContent='이미지 업로드 중…'; imageUrl=await window.GALLA_UPLOAD_MEDIA(f,'image'); }
    const { data, error } = await supa.rpc('create_market',{
      p_question:q, p_description:$('mDesc').value.trim()||null,
      p_category:$('mCategory').value, p_image_url:imageUrl,
      p_close_at:new Date(closeAt).toISOString(), p_outcomes:outcomes, p_liquidity:300
    });
    if(error) throw error;
    // 🔖 해시태그 — 전용칸(#pred-tags) + 질문/설명 #태그 자동추출 → 생성된 마켓에 저장
    try {
      const _te=$('pred-tags'); const _tags=window.GALLA_collectTags(_te?_te.value:'', q, $('mDesc').value);
      if(_tags.length && data) await supa.from('markets').update({ tags:_tags }).eq('id', data);
    } catch(_){}
    // 📈 브레인 성과 역연결 — 갈비스 제목 공식으로 만든 예측이면 기록(크론이 베팅 참여를 측정해 공식 점수화)
    try {
      const ps=JSON.parse(sessionStorage.getItem('GALLA_PICKED_STYLE')||'null');
      if(ps && ps.style && (Date.now()-(ps.at||0))<30*60*1000 && data)
        await supa.from('markets').update({ title_pattern:String(ps.style).slice(0,40) }).eq('id', data);
      sessionStorage.removeItem('GALLA_PICKED_STYLE');
    } catch(_){}
    $('createModal').hidden=true;
    if(__predDraft) __predDraft.clear();   // 생성 성공 → 임시저장 삭제
    toast('예측이 만들어졌습니다! 🎯');
    goDetail(`predict-market.html?id=${data}`);
  }catch(e){ console.error(e); toast('예측 생성에 실패했습니다.'); }
  finally{ btn.disabled=false; btn.textContent='마켓 만들기'; }
}

/* ============ 등급 · 리더보드 ============ */
function renderMyTier(){
  const card=$('myTierCard'); if(!card) return;
  if(!ME){ card.innerHTML=`<div class="tier-card-guest">로그인하고 예언가 등급에 도전하세요</div>`; return; }
  const t=window.GALLA_tierOf(MY_POINTS);
  const nextTxt=t.next?`${t.next.icon} ${t.next.name}까지 ${fmt(t.next.min-MY_POINTS)}P`:'최고 등급 달성! 🎉';
  card.innerHTML=`<div class="tier-card-top">
      <span class="tier-emoji" style="background:${t.color}22;border-color:${t.color}">${t.icon}</span>
      <div class="tier-card-info"><div class="tier-card-name" style="color:${t.color}">${t.name}</div>
        <div class="tier-card-pts">${fmt(MY_POINTS)}P 보유</div></div>
    </div>
    <div class="tier-progress"><div class="tier-progress-fill" style="width:${t.progress}%;background:${t.color}"></div></div>
    <div class="tier-next">${nextTxt}</div>`;
}
async function loadLeaderboard(kind){
  const map={galla:'gallaList',king:'kingList',god:'godList'};
  const el=$(map[kind]); if(!el||el.dataset.loaded) return;
  el.innerHTML=`<div class="lb-loading">불러오는 중…</div>`;
  const badge=window.GALLA_tierBadge;
  if(kind==='galla'){
    const {data}=await supa.from('galla_rank').select('*').order('rank',{ascending:true}).limit(50);
    el.innerHTML=(data||[]).map((r,i)=>`<div class="lb-row"><span class="lb-rank ${i<3?'top':''}">${medal(i)}</span>
      <span class="lb-name" data-nick-uid="${esc(r.user_id||'')}">${esc(r.nickname||'익명')}<br>${badge(r.points)}</span>
      <span class="lb-stat">${fmt(r.points)}P</span></div>`).join('')||emptyLB();
  } else if(kind==='king'){
    // 시즌 랭킹 우선(없으면 전체) — 시즌명 캡션 표시
    let {data}=await supa.from('predict_king_season').select('*').order('profit',{ascending:false}).limit(50);
    let season=data?.[0]?.season||null;
    if(!data||!data.length){ ({data}=await supa.from('predict_king_leaderboard').select('*').order('profit',{ascending:false}).limit(50)); }
    const cap=document.querySelector('#rankKing .lb-caption');
    if(cap) cap.textContent=(season?`🏆 ${season} · `:'')+'예측으로 GP를 가장 많이 딴 적중왕';
    el.innerHTML=(data||[]).map((r,i)=>`<div class="lb-row"><span class="lb-rank ${i<3?'top':''}">${medal(i)}</span>
      <span class="lb-name" data-nick-uid="${esc(r.user_id||'')}">${esc(r.nickname||'익명')} ${title(i,'king')}<br><span class="lb-sub">적중 회 · 참여 회</span></span>
      <span class="lb-stat">${(r.profit||0)>=0?'+':''}${fmt(r.profit)}P</span></div>`).join('')||emptyLB();
  } else {
    const {data}=await supa.from('predict_god_leaderboard').select('*').order('total_volume',{ascending:false}).limit(50);
    el.innerHTML=(data||[]).map((r,i)=>`<div class="lb-row"><span class="lb-rank ${i<3?'top':''}">${medal(i)}</span>
      <span class="lb-name" data-nick-uid="${esc(r.user_id||'')}">${esc(r.nickname||'익명')} ${title(i,'god')}<br><span class="lb-sub">마켓 ${r.markets_created||0}개</span></span>
      <span class="lb-stat">💰 ${fmt(r.total_volume)}P · 👥 ${r.participants||0}</span></div>`).join('')||emptyLB();
  }
  el.dataset.loaded='1';
}
function medal(i){ return i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1); }
function title(i,kind){ if(i!==0) return ''; return kind==='king'?'<span class="lb-title king">👑 예측왕</span>':'<span class="lb-title god">🔮 예측의 신</span>'; }
function emptyLB(){ return `<div class="empty-zone">아직 랭킹이 없습니다.</div>`; }

/* ============ SPA 페이지 훅 ============
   초기화 로직은 위의 initPredictPage 그대로 — 여기서는 감싸기만 한다.
   MPA 단독 문서에서는 존재만 하고 아무도 안 부르므로 동작 불변. */
window.GALLA_PAGE_PREDICT = {
  _root: null,
  _mounted: false,
  async mount(root){
    this._root = root || null;
    if (this._mounted) return;        // keep-alive 재진입 가드
    this._mounted = true;
    await initPredictPage();
  },
  unmount(){ this._mounted = false; this._root = null; },
  activate(){
    // 탭 복귀 시 GP 잔액만 최신화(기존 함수 재사용, 비로그인 no-op)
    try { if (this._mounted) refreshBalance(); } catch (_) {}
  },
  deactivate(){},
  scrolltop(){
    const el = this._root && this._root.closest ? this._root : null;
    const host = el || document.querySelector('.tab-pane[data-tab="predict"] .view-host');
    if (host && host.scrollTo) host.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};
