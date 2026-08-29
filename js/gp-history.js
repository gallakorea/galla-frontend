/* =========================================================
   gp-history.js — GP 지갑 통합 내역 (예측 내역 + GP 원장)
   예측: predict_bets(+markets/outcomes 임베드) — 진행중/적중/미적중/환불
   원장: point_ledger — 사유별 아이콘·라벨, +골드/-레드
========================================================= */
(function () {   // 전역 오염·충돌 방지 — SPA 는 페이지 스크립트를 한 문서에 다 싣는다.
// galla-predict.js 등이 이미 최상위 let supa·$ 를 선언해 두어, 감싸지 않으면
// "Identifier 'supa' has already been declared" 로 이 파일이 통째로 실행되지 않는다
// (에러는 콘솔에만 남고 화면은 그냥 빈 채로 있다 — 실측 2026-08-29 GP 지갑 잔액 '–').
let supa = null, ME = null;
const $ = id => document.getElementById(id);
function fmt(n){ return Math.round(Number(n)||0).toLocaleString('ko-KR'); }
function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function ago(ts){
  const s=Math.floor((Date.now()-new Date(ts))/1000);
  if(s<60)return '방금'; if(s<3600)return Math.floor(s/60)+'분 전';
  if(s<86400)return Math.floor(s/3600)+'시간 전';
  const d=Math.floor(s/86400); if(d<30) return d+'일 전';
  return new Date(ts).toLocaleDateString('ko-KR');
}

document.addEventListener('DOMContentLoaded', async () => {
  supa = await waitForSupabaseClient();
  const { data } = await supa.auth.getSession();
  ME = data?.session?.user || null;
  if(!ME){
    if(confirm('로그인이 필요합니다. 로그인 페이지로 이동할까요?')) (window.GALLA_nav||function(u){location.href=u})('login.html');
    else (window.GALLA_nav||function(u){location.href=u})('galla-predict.html');
    return;
  }
  bindTabs();
  await Promise.all([loadBalance(), loadBets(), loadLedger()]);
  // 딥링크: ?tab=gc|ledger — 지갑 페이지 '내역' 버튼 등에서 진입
  const t = new URLSearchParams(location.search).get('tab');
  if(t){ document.querySelector(`.gh-tab[data-tab="${t}"]`)?.click(); }
});

function bindTabs(){
  document.querySelectorAll('.gh-tab').forEach(t=>t.addEventListener('click',()=>{
    document.querySelectorAll('.gh-tab').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    $('ghBets').hidden = t.dataset.tab!=='bets';
    $('ghLedger').hidden = t.dataset.tab!=='ledger';
    $('ghGc').hidden = t.dataset.tab!=='gc';
    if(t.dataset.tab==='gc' && !$('ghGc').dataset.loaded) loadGc();
  }));
}

/* ============ 갈라코인 (후원 전용 현금성 재화 — GP와 전환 불가) ============ */
async function loadGc(){
  const el=$('ghGc');
  el.dataset.loaded='1';
  el.innerHTML=`<div class="pmd-tab-loading">불러오는 중…</div>`;
  const [balRes, ledRes] = await Promise.all([
    supa.rpc('gc_balance'),
    supa.from('gc_ledger').select('delta,reason,created_at').eq('user_id',ME.id)
      .order('created_at',{ascending:false}).limit(100),
  ]);
  const bal = balRes.data||0;
  const rows = ledRes.data||[];
  const head = `
    <div class="gh-gc-head">
      <div class="gh-gc-bal">💝 갈라코인 <b>${fmt(bal)}</b> GC</div>
      <div class="gh-gc-note">크리에이터 후원 전용 · 1GC=1원 · 현금 충전 · GP와 상호 전환 불가</div>
    </div>`;
  if(!rows.length){
    el.innerHTML = head + `<div class="gh-empty">아직 갈라코인 내역이 없어요.<br>
      <span style="font-size:12px;color:#5c6479">충전(PG 연동 예정) 후 크리에이터를 후원할 수 있습니다.</span></div>`;
    return;
  }
  const label = r => r.reason==='gc:charge' ? ['💳','갈라코인 충전'] : r.reason==='gc:donate' ? ['💝','크리에이터 후원'] : ['🪙',r.reason];
  let lastDay='';
  el.innerHTML = head + rows.map(r=>{
    const [ic,t]=label(r);
    const day=new Date(r.created_at).toLocaleDateString('ko-KR');
    const divider = day!==lastDay ? `<div class="gh-day">${day}</div>` : '';
    lastDay=day;
    const plus=r.delta>=0;
    return divider+`<div class="gh-l">
      <span class="gh-l-ic">${ic}</span>
      <span class="gh-l-m"><span class="gh-l-t">${esc(t)}</span><span class="gh-time">${ago(r.created_at)}</span></span>
      <span class="gh-l-d ${plus?'up':'down'}">${plus?'+':''}${fmt(r.delta)}</span>
    </div>`;
  }).join('');
}

async function loadBalance(){
  const { data } = await supa.rpc('gp_wallet');
  if(data?.ok){
    $('ghBalance').innerHTML = `${fmt(data.total)}<small> GP</small>`;
    // 유료 충전 GP는 게임(예측·일기토) 사용 불가 — 보유 시에만 구분 표시
    if(data.paid > 0){
      const el=document.createElement('div');
      el.className='gh-hero-sub';
      el.innerHTML=`무료(게임 가능) <b>${fmt(data.free)}</b> · 충전(아이템·꾸미기 전용) <b>${fmt(data.paid)}</b>`;
      $('ghBalance').after(el);
    }
  }
}

/* ============ 예측 내역 ============ */
async function loadBets(){
  const el=$('ghBets');
  el.innerHTML=`<div class="pmd-tab-loading">불러오는 중…</div>`;
  const { data, error } = await supa.from('predict_bets')
    .select('id,market_id,stake,odds_at_bet,settled,won,payout,created_at,markets(question,resolved),market_outcomes(label)')
    .eq('user_id', ME.id).order('created_at',{ascending:false}).limit(100);
  if(error){ console.error(error); el.innerHTML=`<div class="pmd-tab-empty">불러오지 못했습니다.</div>`; return; }
  if(!data||!data.length){
    el.innerHTML=`<div class="gh-empty">아직 예측 참여 내역이 없어요.<br>
      <a class="gh-empty-go" href="galla-predict.html">🎯 첫 예측 하러 가기</a></div>`;
    $('ghSummary').textContent='';
    return;
  }
  // 요약: 참여 n · 적중 n · 순손익
  let wins=0, settled=0, net=0;
  data.forEach(b=>{ if(b.settled){ settled++; if(b.won){wins++;} net += (b.payout||0)-(b.stake||0); } });
  $('ghSummary').innerHTML = `참여 <b>${data.length}</b> · 적중 <b>${wins}</b>/${settled} · 정산 손익 <b class="${net>=0?'up':'down'}">${net>=0?'+':''}${fmt(net)}GP</b>`;

  el.innerHTML = data.map(b=>{
    const q=b.markets?.question||'(삭제된 예측)';
    const pick=b.market_outcomes?.label||'';
    let badge, result='';
    if(!b.settled){
      badge=`<span class="gh-badge live"><i></i>진행중</span>`;
      result=`<span class="gh-r">예상 ×${b.odds_at_bet?Number(b.odds_at_bet).toFixed(2):'–'}</span>`;
    } else if(b.won && b.payout>b.stake){
      badge=`<span class="gh-badge win">🏆 적중</span>`;
      result=`<span class="gh-r up">+${fmt(b.payout)}GP</span>`;
    } else if(!b.won && b.payout>=b.stake && b.payout>0){
      badge=`<span class="gh-badge refund">↩️ 환불</span>`;
      result=`<span class="gh-r">+${fmt(b.payout)}GP</span>`;
    } else if(b.won){
      badge=`<span class="gh-badge win">🏆 적중</span>`;
      result=`<span class="gh-r up">+${fmt(b.payout)}GP</span>`;
    } else {
      badge=`<span class="gh-badge lose">미적중</span>`;
      result=`<span class="gh-r down">-${fmt(b.stake)}GP</span>`;
    }
    return `<a class="gh-bet" href="predict-market.html?id=${b.market_id}">
      <div class="gh-bet-top">${badge}<span class="gh-time">${ago(b.created_at)}</span></div>
      <div class="gh-bet-q">${esc(q)}</div>
      <div class="gh-bet-foot">
        <span class="gh-pick">🎯 ${esc(pick)} · ${fmt(b.stake)}GP</span>
        ${result}
      </div>
    </a>`;
  }).join('');
}

/* ============ GP 원장 ============ */
const REASONS = [
  [/^predict:bet$/,   ['🎯','예측 참여']],
  [/^predict:win$/,   ['🏆','예측 적중 상금']],
  [/^predict:combo$/, ['🔥','연승 콤보 보너스']],
  [/^predict:refund$/,['↩️','예측 환불']],
  [/^daily/,          ['🪙','출석 보상']],
  [/^mission:/,       ['✅','미션 보상']],
  [/^shop:/,          ['🛒','상점 구매']],
  [/^charge:/,        ['💳','GP 충전']],
  [/^faction|^push/,  ['⚔️','진영 밀어주기']],
  [/^duel/,           ['🥊','일기토']],
  [/^trade$/,         ['🎯','예측 참여(구)']],
  [/^payout$/,        ['🏆','예측 정산(구)']],
];
function reasonOf(r){
  for(const [re,v] of REASONS){ if(re.test(r||'')) return v; }
  return ['🪙', r||'기타'];
}

async function loadLedger(){
  const el=$('ghLedger');
  el.innerHTML=`<div class="pmd-tab-loading">불러오는 중…</div>`;
  const { data, error } = await supa.from('point_ledger')
    .select('delta,reason,market_id,created_at')
    .eq('user_id', ME.id).order('created_at',{ascending:false}).limit(150);
  if(error){ console.error(error); el.innerHTML=`<div class="pmd-tab-empty">불러오지 못했습니다.</div>`; return; }
  if(!data||!data.length){ el.innerHTML=`<div class="gh-empty">아직 GP 내역이 없어요.</div>`; return; }
  // 날짜 구분선과 함께 렌더
  let lastDay='';
  el.innerHTML = data.map(r=>{
    const [ic,label]=reasonOf(r.reason);
    const day=new Date(r.created_at).toLocaleDateString('ko-KR');
    const divider = day!==lastDay ? `<div class="gh-day">${day}</div>` : '';
    lastDay=day;
    const plus=r.delta>=0;
    const inner=`
      <span class="gh-l-ic">${ic}</span>
      <span class="gh-l-m"><span class="gh-l-t">${esc(label)}</span><span class="gh-time">${ago(r.created_at)}</span></span>
      <span class="gh-l-d ${plus?'up':'down'}">${plus?'+':''}${fmt(r.delta)}</span>`;
    const row = r.market_id
      ? `<a class="gh-l" href="predict-market.html?id=${r.market_id}">${inner}</a>`
      : `<div class="gh-l">${inner}</div>`;
    return divider+row;
  }).join('');
}

})();
