/* =========================================================
   predict-market.js — 예측 마켓 상세/거래 (폴리마켓식)
========================================================= */
let supa = null, ME = null, MARKET = null, POS = null, SIDE = 'yes';
const $ = id => document.getElementById(id);
const marketId = Number(new URLSearchParams(location.search).get('id'));

function toast(msg){const t=$('pmToast');t.textContent=msg;t.hidden=false;clearTimeout(t._t);t._t=setTimeout(()=>t.hidden=true,2200);}
function fmt(n){return Math.round(n).toLocaleString('ko-KR');}
function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function yesPct(m){return Math.round(m.pool_no/(m.pool_yes+m.pool_no)*100);}
function timeLeft(c){const ms=new Date(c)-Date.now();if(ms<=0)return '마감됨';const d=Math.floor(ms/86400000);if(d>=1)return `D-${d} (${new Date(c).toLocaleDateString('ko-KR')})`;const h=Math.floor(ms/3600000);return h>=1?`${h}시간 남음`:`${Math.max(1,Math.floor(ms/60000))}분 남음`;}

// CPMM 매수 추정: spend s → shares
function estShares(m, side, s){
  const y=m.pool_yes, n=m.pool_no, k=y*n;
  if(s<=0) return 0;
  return side==='yes' ? (y+s-(k/(n+s))) : (n+s-(k/(y+s)));
}

document.addEventListener('DOMContentLoaded', async () => {
  supa = await waitForSupabaseClient();
  const { data } = await supa.auth.getSession();
  ME = data?.session?.user || null;
  await refreshBalance();
  $('pointPill').addEventListener('click', async () => {
    if(!ME){location.href='login.html';return;}
    const {data,error}=await supa.rpc('claim_daily');
    if(error)return toast('오류');
    if(data.ok){toast(`출석 완료! +${fmt(data.claimed)}P`);$('pointBalance').textContent=fmt(data.balance)+'P';}
    else toast('오늘 출석은 이미 받았어요.');
  });
  if(!marketId){ $('pmdMain').innerHTML='<div class="empty-zone">잘못된 접근입니다.</div>'; return; }
  await loadMarket();
});

async function refreshBalance(){
  if(!ME){$('pointBalance').textContent='로그인';return;}
  const {data}=await supa.rpc('ensure_balance');
  if(data!=null)$('pointBalance').textContent=fmt(data)+'P';
}

async function loadMarket(){
  const { data: m, error } = await supa.from('markets').select('*').eq('id', marketId).single();
  if(error||!m){ $('pmdMain').innerHTML='<div class="empty-zone">마켓을 찾을 수 없습니다.</div>'; return; }
  MARKET = m;

  // 내 포지션
  POS = null;
  if(ME){
    const { data: p } = await supa.from('market_positions').select('*').eq('market_id',marketId).eq('user_id',ME.id).maybeSingle();
    POS = p || null;
  }
  // 거래 이력(차트)
  const { data: trades } = await supa.from('market_trades').select('price_yes,created_at').eq('market_id',marketId).order('created_at',{ascending:true});

  render(trades||[]);
}

function render(trades){
  const m = MARKET;
  const p = yesPct(m);
  const closed = m.resolved || new Date(m.close_at) <= Date.now();
  const isCreator = ME && m.created_by === ME.id;

  $('pmdMain').innerHTML = `
    <section class="pmd-hero">
      ${m.image_url ? `<img class="pmd-img" src="${m.image_url}">` : ''}
      <div class="pmd-cat">${m.category||''}</div>
      <h1 class="pmd-q">${esc(m.question)}</h1>
      ${m.description ? `<p class="pmd-desc">${esc(m.description)}</p>` : ''}
      <div class="pmd-status">
        ${m.resolved ? `<span class="pmd-resolved ${m.outcome}">✔ 정산 완료 · ${m.outcome==='yes'?'YES':'NO'} 승리</span>`
          : `<span class="pmd-time">⏰ ${timeLeft(m.close_at)}</span>`}
        <span class="pmd-vol">💰 거래량 ${fmt(m.volume)}P</span>
      </div>
    </section>

    <section class="pmd-prob-big">
      <div class="pmd-prob-num"><span class="pmd-prob-yes">${p}%</span> <span class="pmd-prob-label">YES 확률</span></div>
      <div class="pmd-bar"><div class="pmd-bar-yes" style="width:${p}%"></div></div>
      <div class="pmd-bar-legend"><span class="c-yes">YES ${p}%</span><span class="c-no">NO ${100-p}%</span></div>
    </section>

    <section class="pmd-chart">${renderChart(trades, p)}</section>

    ${POS && (POS.yes_shares>0||POS.no_shares>0) ? renderPosition() : ''}

    ${m.resolved ? '' : closed ? renderClosed(isCreator) : renderTrade()}

    ${isCreator && !m.resolved ? renderResolvePanel(closed) : ''}
  `;

  if(!m.resolved && !closed) bindTrade();
  if(isCreator && !m.resolved) bindResolve();
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
    <path d="${area}" fill="rgba(34,197,94,.12)"/>
    <path d="${line}" fill="none" stroke="#22c55e" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  </svg><div class="pmd-chart-cap">YES 확률 추이</div>`;
}

function renderPosition(){
  const m=MARKET;
  const y=POS.yes_shares, n=POS.no_shares;
  return `
  <section class="pmd-pos">
    <div class="pmd-pos-title">내 포지션</div>
    <div class="pmd-pos-row"><span>YES 셰어</span><b class="c-yes">${fmt(y)}</b></div>
    <div class="pmd-pos-row"><span>NO 셰어</span><b class="c-no">${fmt(n)}</b></div>
    <div class="pmd-pos-row"><span>투입 포인트</span><b>${fmt(POS.spent)}P</b></div>
    ${m.resolved ? `<div class="pmd-pos-row payout"><span>정산 수령</span><b>+${fmt(m.outcome==='yes'?y:n)}P</b></div>`
      : `<div class="pmd-pos-hint">적중 시 셰어 1개당 1P 지급 (YES 승리 → ${fmt(y)}P / NO 승리 → ${fmt(n)}P)</div>`}
  </section>`;
}

function renderTrade(){
  return `
  <section class="pmd-trade">
    <div class="pmd-side-toggle">
      <button class="pmd-side yes active" data-side="yes">YES 매수</button>
      <button class="pmd-side no" data-side="no">NO 매수</button>
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
    <button id="tradeBtn" class="pmd-buy">YES 매수</button>
  </section>`;
}

function renderClosed(isCreator){
  return `<section class="pmd-closed">⏰ 거래가 마감되었습니다.${isCreator?' 아래에서 결과를 확정해 정산하세요.':' 생성자의 정산을 기다리는 중입니다.'}</section>`;
}

function renderResolvePanel(closed){
  return `
  <section class="pmd-resolve">
    <div class="pmd-resolve-title">🔧 마켓 정산 (생성자 전용)</div>
    <div class="pmd-resolve-hint">${closed?'결과를 선택하면 이긴 셰어 보유자에게 포인트가 지급됩니다.':'마감 전에도 확정할 수 있습니다.'}</div>
    <div class="pmd-resolve-btns">
      <button class="pmd-rz yes" data-outcome="yes">YES 승리로 정산</button>
      <button class="pmd-rz no" data-outcome="no">NO 승리로 정산</button>
    </div>
  </section>`;
}

/* ===== 거래 인터랙션 ===== */
function bindTrade(){
  document.querySelectorAll('.pmd-side').forEach(b=>b.addEventListener('click',()=>{
    SIDE=b.dataset.side;
    document.querySelectorAll('.pmd-side').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    $('tradeBtn').textContent = SIDE==='yes'?'YES 매수':'NO 매수';
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
  const shares=estShares(MARKET,SIDE,s);
  const avg=s/shares;
  est.innerHTML=`예상 <b>${fmt(shares)}</b> ${SIDE.toUpperCase()} 셰어 · 평균가 ${(avg*100).toFixed(1)}% · 적중 시 <b class="c-yes">+${fmt(shares)}P</b>`;
}

async function doTrade(){
  if(!ME){location.href='login.html';return;}
  const s=Number($('tradeAmt').value)||0;
  if(s<=0)return toast('투입 포인트를 입력하세요.');
  const btn=$('tradeBtn'); btn.disabled=true; const orig=btn.textContent; btn.textContent='처리 중…';
  const {data,error}=await supa.rpc('market_trade',{p_market_id:marketId,p_side:SIDE,p_spend:s});
  if(error){btn.disabled=false;btn.textContent=orig;return toast('거래 실패');}
  if(!data.ok){
    btn.disabled=false;btn.textContent=orig;
    return toast(data.reason==='insufficient'?'포인트가 부족합니다.':data.reason==='closed'?'마감된 마켓입니다.':'거래할 수 없습니다.');
  }
  $('pointBalance').textContent=fmt(data.balance)+'P';
  toast(`매수 완료! ${fmt(data.shares)} ${SIDE.toUpperCase()} 셰어`);
  await loadMarket(); // 가격·포지션·차트 갱신
}

/* ===== 정산 ===== */
function bindResolve(){
  document.querySelectorAll('.pmd-rz').forEach(b=>b.addEventListener('click', async ()=>{
    const outcome=b.dataset.outcome;
    if(!confirm(`정말 '${outcome==='yes'?'YES':'NO'} 승리'로 정산할까요? 되돌릴 수 없습니다.`))return;
    b.disabled=true;
    const {data,error}=await supa.rpc('market_resolve',{p_market_id:marketId,p_outcome:outcome});
    if(error||!data.ok){b.disabled=false;return toast(data?.reason==='forbidden'?'생성자만 정산할 수 있습니다.':'정산 실패');}
    toast(`정산 완료! ${data.paid_users}명에게 지급`);
    await refreshBalance();
    await loadMarket();
  }));
}
