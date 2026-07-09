/* =========================================================
   predict-market.js — 예측 마켓 상세/거래 (폴리마켓식)
========================================================= */
let supa = null, ME = null, MARKET = null, OUTCOMES = [], ACTIVE = null, POS = null, SIDE = 'yes', CREATOR = null;
let MY_SAVED = false; // 마켓 저장(북마크) 상태
const $ = id => document.getElementById(id);
const marketId = Number(new URLSearchParams(location.search).get('id'));

function toast(msg){const t=$('pmToast');t.textContent=msg;t.hidden=false;clearTimeout(t._t);t._t=setTimeout(()=>t.hidden=true,2200);}
function fmt(n){return Math.round(n).toLocaleString('ko-KR');}
function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function isMulti(){return MARKET && MARKET.market_type==='multi';}
function ocPct(o){return o? Math.round(o.pool_no/(o.pool_yes+o.pool_no)*100):50;}
function timeLeft(c){const ms=new Date(c)-Date.now();if(ms<=0)return '마감됨';const d=Math.floor(ms/86400000);if(d>=1)return `D-${d} (${new Date(c).toLocaleDateString('ko-KR')})`;const h=Math.floor(ms/3600000);return h>=1?`${h}시간 남음`:`${Math.max(1,Math.floor(ms/60000))}분 남음`;}

// CPMM 매수 추정: 후보(outcome) 기준 spend s → shares
function estShares(o, side, s){
  const y=o.pool_yes, n=o.pool_no, k=y*n;
  if(s<=0) return 0;
  return side==='yes' ? (y+s-(k/(n+s))) : (n+s-(k/(y+s)));
}
// YES/NO 라벨: 다중은 후보명/아님, 이진은 YES/NO (👍/👎 정체성)
function yesLabel(){return isMulti()&&ACTIVE?ACTIVE.label:'YES';}
function noLabel(){return isMulti()?'아님':'NO';}
function ocLabel(id){const o=OUTCOMES.find(x=>x.id===id);return o?o.label:'';}

// 로그인 필요 → 알럿(확인 시 로그인 페이지)
function needLogin(){
  if(ME) return false;
  if(confirm('로그인이 필요합니다. 로그인 페이지로 이동할까요?')) location.href='login.html';
  return true;
}

let MY_BAL = 0;

/* 마켓 저장 토글 (렌더가 갈아끼워지므로 위임) */
document.addEventListener('click', async e => {
  const btn = e.target.closest('#pmdSaveBtn');
  if(!btn) return;
  if(needLogin()) return;
  btn.disabled = true;
  try{
    if(MY_SAVED){
      await supa.from('market_bookmarks').delete()
        .eq('market_id', marketId).eq('user_id', ME.id);
    }else{
      await supa.from('market_bookmarks').insert({ market_id: marketId, user_id: ME.id });
    }
    MY_SAVED = !MY_SAVED;
    btn.textContent = MY_SAVED ? '🔖 저장됨' : '🔖 저장';
    btn.classList.toggle('on', MY_SAVED);
  }finally{
    btn.disabled = false;
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  supa = await waitForSupabaseClient();
  const { data } = await supa.auth.getSession();
  ME = data?.session?.user || null;
  await refreshBalance();
  if(!marketId){ $('pmdMain').innerHTML='<div class="empty-zone">잘못된 접근입니다.</div>'; return; }
  await loadMarket();
});

async function refreshBalance(){
  if(!ME) return;
  const {data}=await supa.rpc('ensure_balance');
  if(data!=null){ MY_BAL=data; const el=$('tradeBalance'); if(el) el.textContent='보유 '+fmt(data)+'P'; }
}

async function loadMarket(){
  const { data: m, error } = await supa.from('markets').select('*').eq('id', marketId).single();
  if(error||!m){ $('pmdMain').innerHTML='<div class="empty-zone">마켓을 찾을 수 없습니다.</div>'; return; }
  MARKET = m;

  // 저장(북마크) 상태
  MY_SAVED = false;
  if(ME){
    const { data: bm } = await supa.from('market_bookmarks')
      .select('market_id').eq('market_id', marketId).eq('user_id', ME.id).maybeSingle();
    MY_SAVED = !!bm;
  }

  // 크리에이터(작성자) 프로필
  CREATOR = null;
  if(m.created_by){
    const { data: cp } = await supa.from('user_profiles')
      .select('user_id,nickname,level').eq('user_id', m.created_by).maybeSingle();
    CREATOR = cp || null;
  }

  const { data: outs } = await supa.from('market_outcomes').select('*').eq('market_id',marketId).order('sort_order',{ascending:true});
  OUTCOMES = outs || [];
  // 활성 후보 유지/기본값
  ACTIVE = (ACTIVE && OUTCOMES.find(o=>o.id===ACTIVE.id)) || OUTCOMES[0] || null;

  await loadActiveDetail();
  render();
}

async function loadActiveDetail(){
  POS = null; ACTIVE_TRADES = [];
  if(!ACTIVE) return;
  if(ME){
    const { data: p } = await supa.from('market_positions').select('*').eq('outcome_id',ACTIVE.id).eq('user_id',ME.id).maybeSingle();
    POS = p || null;
  }
  const { data: trades } = await supa.from('market_trades').select('price_yes,created_at').eq('outcome_id',ACTIVE.id).order('created_at',{ascending:true});
  ACTIVE_TRADES = trades || [];
}
let ACTIVE_TRADES = [];

async function selectOutcome(id){
  ACTIVE = OUTCOMES.find(o=>o.id===id) || ACTIVE;
  await loadActiveDetail();
  render();
  window.scrollTo({top:0,behavior:'smooth'});
}
window.selectOutcome = selectOutcome;

function renderCreator(){
  const name = esc(CREATOR?.nickname || '갈라 크리에이터');
  const init = (CREATOR?.nickname || '갈').trim().charAt(0) || '갈';
  const lv = CREATOR?.level ?? 1;
  return `
    <div class="pmd-creator">
      <div class="pmd-creator-av">${init}</div>
      <div class="pmd-creator-info">
        <div class="pmd-creator-line">
          <span class="pmd-creator-name">${name}</span>
          <span class="pmd-creator-lv">Lv.${lv}</span>
          <span class="pmd-creator-tag">🔮 크리에이터</span>
        </div>
        <div class="pmd-creator-sub">이 예측을 만든 크리에이터</div>
      </div>
    </div>`;
}

function render(){
  const m = MARKET;
  const p = ocPct(ACTIVE);
  const closed = m.resolved || new Date(m.close_at) <= Date.now();
  const isCreator = ME && m.created_by === ME.id;
  const multi = isMulti();
  const winName = m.resolved_outcome_id ? (OUTCOMES.find(o=>o.id===m.resolved_outcome_id)?.label) : null;

  $('pmdMain').innerHTML = `
    <section class="pmd-hero">
      ${m.image_url ? `<img class="pmd-img" src="${m.image_url}">` : ''}
      <div class="pmd-cat">${m.category||''}${multi?' · 여러 선택지':''}</div>
      ${renderCreator()}
      <h1 class="pmd-q">${esc(m.question)}</h1>
      ${m.description ? `<p class="pmd-desc">${esc(m.description)}</p>` : ''}
      <div class="pmd-status">
        ${m.resolved ? `<span class="pmd-resolved yes">✔ 정산 완료 · ${esc(multi?(winName||''):(m.outcome==='yes'?'YES':'NO'))} 승리</span>`
          : `<span class="pmd-time">⏰ ${timeLeft(m.close_at)}</span>`}
        <span class="pmd-vol">💰 거래량 ${fmt(m.volume)}P</span>
        <button class="pmd-save ${MY_SAVED ? 'on' : ''}" id="pmdSaveBtn">${MY_SAVED ? '🔖 저장됨' : '🔖 저장'}</button>
      </div>
    </section>

    ${multi ? renderOutcomeSelector() : ''}

    <section class="pmd-prob-big">
      <div class="pmd-prob-num"><span class="pmd-prob-yes">${p}%</span> <span class="pmd-prob-label">👍 ${esc(multi?ACTIVE.label:'YES')} 확률</span></div>
      <div class="pmd-bar"><div class="pmd-bar-yes" style="width:${p}%"></div></div>
      <div class="pmd-bar-legend"><span class="c-yes">👍 ${esc(yesLabel())} ${p}%</span><span class="c-no">👎 ${esc(noLabel())} ${100-p}%</span></div>
    </section>

    <section class="pmd-chart">${renderChart(ACTIVE_TRADES, p)}</section>

    ${POS && (POS.yes_shares>0||POS.no_shares>0) ? renderPosition() : ''}

    ${m.resolved ? '' : closed ? renderClosed(isCreator) : renderTrade()}

    ${isCreator && !m.resolved ? renderResolvePanel(closed) : ''}

    <section class="pmd-tabs">
      <div class="pmd-tabbar">
        <button class="pmd-tab active" data-tab="comments">댓글</button>
        <button class="pmd-tab" data-tab="holders">상위 보유자</button>
        <button class="pmd-tab" data-tab="positions">포지션</button>
        <button class="pmd-tab" data-tab="activity">활동</button>
      </div>
      <div id="pmdTabBody" class="pmd-tab-body"></div>
    </section>

    <section class="pmd-related">
      <div class="pmd-related-title">관련 마켓</div>
      <div id="pmdRelated" class="pmd-related-list"><div class="pmd-tab-loading">불러오는 중…</div></div>
    </section>
  `;

  if(!m.resolved && !closed) bindTrade();
  if(isCreator && !m.resolved) bindResolve();
  bindTabs();
  loadTab('comments');
  loadRelated();
}

/* ===== 관련 마켓 (같은 카테고리 우선, 거래량순) ===== */
async function loadRelated(){
  const wrap=$('pmdRelated'); if(!wrap) return;
  // 같은 카테고리 미마감 마켓
  let { data } = await supa.from('markets')
    .select('id,question,category,market_type,volume,close_at,resolved')
    .neq('id', marketId).eq('category', MARKET.category)
    .order('volume',{ascending:false}).limit(6);
  // 부족하면 전체에서 채움
  if(!data || data.length<3){
    const { data: more } = await supa.from('markets')
      .select('id,question,category,market_type,volume,close_at,resolved')
      .neq('id', marketId).order('volume',{ascending:false}).limit(6);
    const seen=new Set((data||[]).map(m=>m.id));
    (more||[]).forEach(m=>{ if(!seen.has(m.id)&&(data=data||[]).length<6) data.push(m); });
  }
  if(!data || !data.length){ wrap.innerHTML=`<div class="pmd-tab-empty">관련 마켓이 없습니다.</div>`; return; }

  // 각 마켓 대표 확률(첫 후보) 로드
  const ids=data.map(m=>m.id);
  const { data: outs } = await supa.from('market_outcomes')
    .select('market_id,label,pool_yes,pool_no,sort_order').in('market_id',ids);
  const byM={}; (outs||[]).forEach(o=>(byM[o.market_id]||=[]).push(o));
  Object.values(byM).forEach(a=>a.sort((x,y)=>x.sort_order-y.sort_order));

  wrap.innerHTML=data.map(m=>{
    const list=byM[m.id]||[];
    const top=list.map(o=>({l:o.label,p:Math.round(o.pool_no/(o.pool_yes+o.pool_no)*100)})).sort((a,b)=>b.p-a.p)[0];
    const pctTxt = m.market_type==='multi'
      ? (top?`${esc(top.l)} ${top.p}%`:'—')
      : (top?`👍 ${top.p}%`:'—');
    return `<a class="pmd-related-item" href="predict-market.html?id=${m.id}">
      <div class="pmd-related-q">${esc(m.question)}</div>
      <div class="pmd-related-meta"><span class="pmd-related-pct">${pctTxt}</span><span>💰 ${fmt(m.volume)}P</span></div>
    </a>`;
  }).join('');
}

/* ===== 탭 (댓글 / 상위 보유자 / 포지션 / 활동) ===== */
let TAB = 'comments';
function bindTabs(){
  document.querySelectorAll('.pmd-tab').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('.pmd-tab').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    TAB=b.dataset.tab; loadTab(TAB);
  }));
}

// 닉네임 일괄 조회
async function fetchProfiles(ids){
  const map={};
  const uniq=[...new Set(ids.filter(Boolean))];
  if(!uniq.length) return map;
  const { data } = await supa.from('user_profiles').select('user_id,nickname,level').in('user_id',uniq);
  data?.forEach(p=>map[p.user_id]=p);
  return map;
}
function ago(ts){
  const s=Math.floor((Date.now()-new Date(ts))/1000);
  if(s<60)return '방금';if(s<3600)return Math.floor(s/60)+'분 전';
  if(s<86400)return Math.floor(s/3600)+'시간 전';return Math.floor(s/86400)+'일 전';
}

async function loadTab(kind){
  const body=$('pmdTabBody');
  body.innerHTML=`<div class="pmd-tab-loading">불러오는 중…</div>`;
  if(kind==='comments') return loadComments(body);
  if(kind==='holders')  return loadHolders(body);
  if(kind==='positions')return loadPositions(body);
  if(kind==='activity') return loadActivity(body);
}

/* ----- 활동: 최근 거래 피드 ----- */
async function loadActivity(body){
  const { data } = await supa.from('market_trades')
    .select('user_id,side,spend,shares,outcome_id,created_at').eq('market_id',marketId)
    .order('created_at',{ascending:false}).limit(40);
  const profs=await fetchProfiles((data||[]).map(t=>t.user_id));
  if(!data||!data.length){ body.innerHTML=emptyTab('아직 거래가 없습니다.'); return; }
  const multi=isMulti();
  body.innerHTML=`<div class="pmd-feed">`+data.map(t=>`
    <div class="pmd-feed-row">
      <span class="pmd-feed-side ${t.side}">${multi?esc(ocLabel(t.outcome_id)):t.side.toUpperCase()}</span>
      <span class="pmd-feed-txt"><b>${esc(profs[t.user_id]?.nickname||'익명')}</b> · ${multi?(t.side==='yes'?'됨':'안됨'):''} ${fmt(t.spend)}P 매수</span>
      <span class="pmd-feed-time">${ago(t.created_at)}</span>
    </div>`).join('')+`</div>`;
}

/* ----- 상위 보유자: 셰어 많은 순 ----- */
async function loadHolders(body){
  const { data } = await supa.from('market_positions')
    .select('user_id,yes_shares,no_shares,spent,outcome_id').eq('market_id',marketId);
  const profs=await fetchProfiles((data||[]).map(p=>p.user_id));
  const rows=(data||[]).map(p=>({...p,total:p.yes_shares+p.no_shares})).sort((a,b)=>b.total-a.total).slice(0,30);
  if(!rows.length){ body.innerHTML=emptyTab('아직 보유자가 없습니다.'); return; }
  const multi=isMulti();
  body.innerHTML=`<div class="pmd-holders">`+rows.map((p,i)=>{
    const dom=p.yes_shares>=p.no_shares?'yes':'no';
    const tag=multi?`${esc(ocLabel(p.outcome_id))} ${dom==='yes'?'됨':'안됨'}`:dom.toUpperCase();
    return `<div class="pmd-holder-row">
      <span class="pmd-holder-rank">${i+1}</span>
      <span class="pmd-holder-name">${esc(profs[p.user_id]?.nickname||'익명')}</span>
      <span class="pmd-holder-side ${dom}">${tag} ${fmt(Math.max(p.yes_shares,p.no_shares))}</span>
    </div>`;}).join('')+`</div>`;
}

/* ----- 포지션: YES/NO 진영별 분포 ----- */
async function loadPositions(body){
  const { data } = await supa.from('market_positions')
    .select('user_id,yes_shares,no_shares').eq('market_id',marketId);
  const profs=await fetchProfiles((data||[]).map(p=>p.user_id));
  const yesH=(data||[]).filter(p=>p.yes_shares>0).sort((a,b)=>b.yes_shares-a.yes_shares);
  const noH=(data||[]).filter(p=>p.no_shares>0).sort((a,b)=>b.no_shares-a.no_shares);
  const col=(arr,side)=>`<div class="pmd-pos-col">
      <div class="pmd-pos-col-head ${side}">${side.toUpperCase()} 진영 · ${arr.length}명</div>
      ${arr.slice(0,20).map(p=>`<div class="pmd-pos-item"><span>${esc(profs[p.user_id]?.nickname||'익명')}</span><b>${fmt(side==='yes'?p.yes_shares:p.no_shares)}</b></div>`).join('')||'<div class="pmd-pos-none">없음</div>'}
    </div>`;
  if(!data||!data.length){ body.innerHTML=emptyTab('아직 포지션이 없습니다.'); return; }
  body.innerHTML=`<div class="pmd-pos-cols">${col(yesH,'yes')}${col(noH,'no')}</div>`;
}

function emptyTab(msg){ return `<div class="pmd-tab-empty">${msg}</div>`; }

/* ----- 댓글: 배틀식 (👍/👎 진영 + 좋아요 + 대댓글 @멘션) ----- */
let CMT_SIDE = 'yes';
function cmtSideLabel(side){ return isMulti() ? (side==='yes'?'👍 긍정':'👎 부정') : (side==='yes'?'👍 YES':'👎 NO'); }
// @멘션 하이라이트
function cmtBody(content){ return esc(content).replace(/@(\S+)/g,'<span class="pmd-mention">@$1</span>'); }

let CMT_DATA=null;               // {tops, childrenOf, profs, likeAgg, myLikes}
let CMT_TOP_LIMIT=8;             // 최상위 댓글 노출 수
const CMT_EXPANDED=new Set();    // 답글 펼친 스레드 id

async function loadComments(body){
  if(POS){ CMT_SIDE = (POS.no_shares > POS.yes_shares) ? 'no' : 'yes'; }
  const { data: rows } = await supa.from('market_comments')
    .select('id,user_id,side,content,created_at,parent_id').eq('market_id',marketId)
    .order('created_at',{ascending:true}).limit(500);

  const profs = await fetchProfiles((rows||[]).map(c=>c.user_id));
  const ids=(rows||[]).map(c=>c.id);
  const likeAgg={}; const myLikes=new Set();
  if(ids.length){
    const { data: likes } = await supa.from('market_comment_likes').select('comment_id,user_id').in('comment_id',ids);
    likes?.forEach(l=>{ likeAgg[l.comment_id]=(likeAgg[l.comment_id]||0)+1; if(ME&&l.user_id===ME.id) myLikes.add(l.comment_id); });
  }
  const tops=(rows||[]).filter(c=>!c.parent_id).reverse(); // 최신 부모 위로
  const childrenOf={}; (rows||[]).forEach(c=>{ if(c.parent_id) (childrenOf[c.parent_id]||=[]).push(c); });
  Object.values(childrenOf).forEach(a=>a.sort((x,y)=>new Date(x.created_at)-new Date(y.created_at)));

  CMT_DATA={ tops, childrenOf, profs, likeAgg, myLikes };
  renderComments(body);
}

function renderComments(body){
  const { tops, childrenOf, profs, likeAgg, myLikes } = CMT_DATA;
  const nick = uid => profs[uid]?.nickname || '익명';

  const cmtHtml=(c,isReply,topId)=>{
    const liked=myLikes.has(c.id);
    return `<div class="pmd-cmt ${c.side} ${isReply?'reply':''}" data-id="${c.id}" data-top="${topId}" data-author="${esc(nick(c.user_id))}">
      <div class="pmd-cmt-head">
        <span class="pmd-cmt-flag ${c.side}">${c.side==='yes'?'👍':'👎'}</span>
        <span class="pmd-cmt-name">${esc(nick(c.user_id))}</span>
        <span class="pmd-cmt-time">${ago(c.created_at)}</span>
      </div>
      <div class="pmd-cmt-body">${cmtBody(c.content)}</div>
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
      repliesBlock = expanded
        ? `<div class="pmd-cmt-replies">${kids.map(k=>cmtHtml(k,true,c.id)).join('')}</div>
           <button class="pmd-reply-toggle" data-top="${c.id}" data-act="collapse">답글 숨기기 ▴</button>`
        : `<button class="pmd-reply-toggle" data-top="${c.id}" data-act="expand">${kids.length}개 답글 보기 ▾</button>`;
    }
    return `<div class="pmd-cmt-thread">
      ${cmtHtml(c,false,c.id)}
      ${repliesBlock}
      <div class="pmd-cmt-replybox" id="replybox-${c.id}" hidden></div>
    </div>`;
  };

  const shown=tops.slice(0,CMT_TOP_LIMIT);
  const remaining=tops.length-shown.length;

  body.innerHTML = `
    <div class="pmd-cmt-compose">
      <div class="pmd-cmt-sidesel">
        <button class="pmd-cmt-side yes ${CMT_SIDE==='yes'?'active':''}" data-side="yes">${cmtSideLabel('yes')}</button>
        <button class="pmd-cmt-side no ${CMT_SIDE==='no'?'active':''}" data-side="no">${cmtSideLabel('no')}</button>
      </div>
      <div class="pmd-cmt-inputrow">
        <input id="cmtInput" class="pmd-cmt-input" maxlength="300" placeholder="이 예측에 대한 의견을 남기세요…">
        <button id="cmtSend" class="pmd-cmt-send">게시</button>
      </div>
    </div>
    <div class="pmd-cmt-list">
      ${tops.length ? shown.map(renderThread).join('') : emptyTab('첫 의견을 남겨보세요!')}
    </div>
    ${remaining>0?`<button id="cmtMore" class="pmd-cmt-more">댓글 더 보기 (${remaining})</button>`:''}`;

  // 진영 선택
  body.querySelectorAll('.pmd-cmt-compose .pmd-cmt-side').forEach(b=>b.addEventListener('click',()=>{
    CMT_SIDE=b.dataset.side;
    body.querySelectorAll('.pmd-cmt-compose .pmd-cmt-side').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
  }));
  $('cmtSend').addEventListener('click', ()=>postComment($('cmtInput').value, CMT_SIDE, null, body));
  // 댓글 더 보기
  $('cmtMore')?.addEventListener('click', ()=>{ CMT_TOP_LIMIT+=10; renderComments(body); });
  // 답글 접기/펼치기
  body.querySelectorAll('.pmd-reply-toggle').forEach(b=>b.addEventListener('click',()=>{
    const id=Number(b.dataset.top);
    if(b.dataset.act==='expand') CMT_EXPANDED.add(id); else CMT_EXPANDED.delete(id);
    renderComments(body);
  }));
  // 좋아요
  body.querySelectorAll('.pmd-cmt-like').forEach(b=>b.addEventListener('click', async ()=>{
    if(needLogin())return;
    const id=Number(b.dataset.id); const on=b.classList.contains('on');
    const span=b.querySelector('span'); let n=Number(span.textContent);
    if(on){ await supa.from('market_comment_likes').delete().eq('comment_id',id).eq('user_id',ME.id); b.classList.remove('on'); span.textContent=Math.max(0,n-1); (CMT_DATA.likeAgg[id]=(CMT_DATA.likeAgg[id]||1)-1); CMT_DATA.myLikes.delete(id); }
    else { const {error}=await supa.from('market_comment_likes').insert({comment_id:id,user_id:ME.id}); if(!error){ b.classList.add('on'); span.textContent=n+1; CMT_DATA.likeAgg[id]=(CMT_DATA.likeAgg[id]||0)+1; CMT_DATA.myLikes.add(id);} }
  }));
  // 답글 → 해당 스레드 최하단 입력창(@멘션 자동, 자동 펼침)
  body.querySelectorAll('.pmd-cmt-reply').forEach(b=>b.addEventListener('click', ()=>{
    if(needLogin())return;
    const cmtEl=b.closest('.pmd-cmt');
    const topId=Number(cmtEl.dataset.top);
    const author=cmtEl.dataset.author;
    CMT_EXPANDED.add(topId);        // 답글 달면 스레드 펼침
    if(!$('replybox-'+topId)) renderComments(body);
    const box=$('replybox-'+topId);
    box.hidden=false;
    box.innerHTML=`<div class="pmd-cmt-inputrow reply">
      <input class="pmd-cmt-input reply-input" maxlength="300" value="@${author} " placeholder="답글 달기…">
      <button class="pmd-cmt-send reply-send">게시</button>
    </div>`;
    const inp=box.querySelector('.reply-input'); inp.focus(); inp.setSelectionRange(inp.value.length,inp.value.length);
    box.querySelector('.reply-send').addEventListener('click', ()=>postComment(inp.value, CMT_SIDE, topId, body));
    box.scrollIntoView({block:'nearest',behavior:'smooth'});
  }));
}

async function postComment(text, side, parentId, body){
  if(needLogin())return;
  const txt=(text||'').trim();
  if(!txt || txt.startsWith('@')&&txt.replace(/^@\S+\s*/,'').length===0)return toast('의견을 입력하세요.');
  const payload={market_id:marketId,user_id:ME.id,side,content:txt};
  if(parentId) payload.parent_id=parentId;
  const { error } = await supa.from('market_comments').insert(payload);
  if(error)return toast('등록 실패');
  await refreshBalance();
  loadComments(body);
}

function renderChart(trades, curP){
  const pts = [{price:0.5}, ...trades.map(t=>({price:t.price_yes})), {price:curP/100}];
  const W=320,H=120,pad=6;
  if(pts.length<2) return `<div class="pmd-chart-empty">아직 거래 내역이 없습니다</div>`;
  const step=(W-pad*2)/(pts.length-1);
  const xy=pts.map((pt,i)=>[pad+i*step, H-pad-(pt.price)*(H-pad*2)]);
  const line=xy.map((c,i)=>(i?'L':'M')+c[0].toFixed(1)+' '+c[1].toFixed(1)).join(' ');
  const area=`M ${xy[0][0]} ${H-pad} `+xy.map(c=>'L '+c[0].toFixed(1)+' '+c[1].toFixed(1)).join(' ')+` L ${xy[xy.length-1][0]} ${H-pad} Z`;
  return `<svg viewBox="0 0 ${W} ${H}" class="pmd-chart-svg" preserveAspectRatio="none">
    <path d="${area}" fill="rgba(51,86,255,.14)"/>
    <path d="${line}" fill="none" stroke="#3356ff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  </svg><div class="pmd-chart-cap">👍 ${esc(yesLabel())} 확률 추이</div>`;
}

// 다중 후보 선택기
function renderOutcomeSelector(){
  const winId = MARKET.resolved_outcome_id;
  return `<section class="pmd-oc-list">
    ${OUTCOMES.map(o=>{
      const p=ocPct(o); const on=ACTIVE&&o.id===ACTIVE.id; const win=o.is_winner;
      return `<button class="pmd-oc ${on?'on':''} ${win?'win':''}" onclick="selectOutcome(${o.id})">
        <span class="pmd-oc-label">${esc(o.label)}${win?' 👑':''}</span>
        <span class="pmd-oc-bar"><span style="width:${p}%"></span></span>
        <span class="pmd-oc-pct">${p}%</span>
      </button>`;
    }).join('')}
  </section>`;
}

function renderPosition(){
  const m=MARKET; const multi=isMulti();
  const y=POS.yes_shares, n=POS.no_shares;
  const yl=multi?esc(ACTIVE.label):'YES', nl=multi?'아님':'NO';
  const won = multi ? (m.resolved_outcome_id===ACTIVE.id) : (m.outcome==='yes');
  return `
  <section class="pmd-pos">
    <div class="pmd-pos-title">내 포지션 · ${esc(multi?ACTIVE.label:'예/아니오')}</div>
    <div class="pmd-pos-row"><span>👍 ${yl} 셰어</span><b class="c-yes">${fmt(y)}</b></div>
    <div class="pmd-pos-row"><span>👎 ${nl} 셰어</span><b class="c-no">${fmt(n)}</b></div>
    <div class="pmd-pos-row"><span>투입 포인트</span><b>${fmt(POS.spent)}P</b></div>
    ${m.resolved ? `<div class="pmd-pos-row payout"><span>정산 수령</span><b>+${fmt(won?y:n)}P</b></div>`
      : `<div class="pmd-pos-hint">적중 시 셰어 1개당 1P 지급 (👍 ${yl} → ${fmt(y)}P / 👎 ${nl} → ${fmt(n)}P)</div>`}
  </section>`;
}

function renderTrade(){
  const yl=isMulti()?esc(ACTIVE.label):'YES', nl=isMulti()?'아님':'NO';
  return `
  <section class="pmd-trade">
    ${isMulti()?`<div class="pmd-trade-oc">선택: <b>${esc(ACTIVE.label)}</b></div>`:''}
    ${ME?`<div class="pmd-trade-bal" id="tradeBalance">보유 ${fmt(MY_BAL)}P</div>`:''}
    <div class="pmd-side-toggle">
      <button class="pmd-side yes active" data-side="yes">👍 ${yl} 매수</button>
      <button class="pmd-side no" data-side="no">👎 ${nl} 매수</button>
    </div>
    <div class="pmd-amount-row">
      <input id="tradeAmt" class="pmd-amount" type="number" min="1" placeholder="투입 포인트" inputmode="numeric">
      <div class="pmd-quick">
        <button data-add="100">+100</button>
        <button data-add="500">+500</button>
        <button data-add="1000">+1K</button>
        <button data-max="1">MAX</button>
      </div>
    </div>
    <div id="tradeEst" class="pmd-est">포인트를 입력하세요</div>
    <button id="tradeBtn" class="pmd-buy yes">👍 ${yl} 매수</button>
  </section>`;
}

function renderClosed(isCreator){
  return `<section class="pmd-closed">⏰ 거래가 마감되었습니다.${isCreator?' 아래에서 결과를 확정해 정산하세요.':' 생성자의 정산을 기다리는 중입니다.'}</section>`;
}

function renderResolvePanel(closed){
  const hint = closed?'결과를 선택하면 이긴 셰어 보유자에게 포인트가 지급됩니다.':'마감 전에도 확정할 수 있습니다.';
  const btns = isMulti()
    ? `<div class="pmd-resolve-multi">${OUTCOMES.map(o=>`<button class="pmd-rz-oc" data-outcome-id="${o.id}">${esc(o.label)} 승리</button>`).join('')}</div>`
    : `<div class="pmd-resolve-btns">
        <button class="pmd-rz yes" data-outcome="yes">YES 승리로 정산</button>
        <button class="pmd-rz no" data-outcome="no">NO 승리로 정산</button>
      </div>`;
  return `
  <section class="pmd-resolve">
    <div class="pmd-resolve-title">🔧 마켓 정산 (생성자 전용)</div>
    <div class="pmd-resolve-hint">${hint}</div>
    ${btns}
  </section>`;
}

/* ===== 거래 인터랙션 ===== */
function bindTrade(){
  const yl=isMulti()?ACTIVE.label:'YES', nl=isMulti()?'아님':'NO';
  document.querySelectorAll('.pmd-side').forEach(b=>b.addEventListener('click',()=>{
    SIDE=b.dataset.side;
    document.querySelectorAll('.pmd-side').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    $('tradeBtn').textContent = (SIDE==='yes'?'👍 '+yl:'👎 '+nl)+' 매수';
    $('tradeBtn').className = 'pmd-buy '+SIDE;
    updateEst();
  }));
  $('tradeAmt').addEventListener('input', updateEst);
  document.querySelectorAll('.pmd-quick button').forEach(b=>b.addEventListener('click', async ()=>{
    const amt=$('tradeAmt');
    if(b.dataset.max){
      const {data}=await supa.rpc('ensure_balance');
      amt.value=Math.floor(data||0);
    } else {
      amt.value=(Number(amt.value)||0)+Number(b.dataset.add);
    }
    updateEst();
  }));
  $('tradeBtn').addEventListener('click', doTrade);
}

function updateEst(){
  const s=Number($('tradeAmt').value)||0;
  const est=$('tradeEst');
  if(s<=0){est.textContent='포인트를 입력하세요';return;}
  const shares=estShares(ACTIVE,SIDE,s);
  const avg=s/shares;
  const sideL=(SIDE==='yes'?'👍 '+(isMulti()?ACTIVE.label:'YES'):'👎 '+(isMulti()?'아님':'NO'));
  est.innerHTML=`예상 <b>${fmt(shares)}</b> ${esc(sideL)} 셰어 · 평균가 ${(avg*100).toFixed(1)}% · 적중 시 <b class="c-yes">+${fmt(shares)}P</b>`;
}

async function doTrade(){
  if(needLogin())return;
  const s=Number($('tradeAmt').value)||0;
  if(s<=0)return toast('투입 포인트를 입력하세요.');
  const btn=$('tradeBtn'); btn.disabled=true; const orig=btn.textContent; btn.textContent='처리 중…';
  const {data,error}=await supa.rpc('market_trade',{p_outcome_id:ACTIVE.id,p_side:SIDE,p_spend:s});
  if(error){btn.disabled=false;btn.textContent=orig;return toast('거래 실패');}
  if(!data.ok){
    btn.disabled=false;btn.textContent=orig;
    return toast(data.reason==='insufficient'?'포인트가 부족합니다.':data.reason==='closed'?'마감된 마켓입니다.':'거래할 수 없습니다.');
  }
  MY_BAL=data.balance;
  toast(`매수 완료! ${fmt(data.shares)}셰어`);
  await loadMarket(); // 가격·포지션·차트 갱신
}

/* ===== 정산 ===== */
function bindResolve(){
  // 이진: yes/no
  document.querySelectorAll('.pmd-rz').forEach(b=>b.addEventListener('click', async ()=>{
    const outcome=b.dataset.outcome;
    if(!confirm(`정말 '${outcome==='yes'?'YES':'NO'} 승리'로 정산할까요? 되돌릴 수 없습니다.`))return;
    b.disabled=true;
    const {data,error}=await supa.rpc('market_resolve',{p_market_id:marketId,p_side:outcome});
    if(error||!data.ok){b.disabled=false;return toast(data?.reason==='forbidden'?'생성자만 정산할 수 있습니다.':'정산 실패');}
    toast(`정산 완료! ${data.paid_users}명에게 지급`);
    await refreshBalance(); await loadMarket();
  }));
  // 다중: 승리 후보 선택
  document.querySelectorAll('.pmd-rz-oc').forEach(b=>b.addEventListener('click', async ()=>{
    const oid=Number(b.dataset.outcomeId);
    const label=OUTCOMES.find(o=>o.id===oid)?.label||'';
    if(!confirm(`'${label} 승리'로 정산할까요? 되돌릴 수 없습니다.`))return;
    b.disabled=true;
    const {data,error}=await supa.rpc('market_resolve',{p_market_id:marketId,p_outcome_id:oid});
    if(error||!data.ok){b.disabled=false;return toast(data?.reason==='forbidden'?'생성자만 정산할 수 있습니다.':'정산 실패');}
    toast(`정산 완료! ${data.paid_users}명에게 지급`);
    await refreshBalance(); await loadMarket();
  }));
}
