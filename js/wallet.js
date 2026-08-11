/* =========================================================
   wallet.js — 내 지갑 (GP 무료/충전 · 갈라코인 · 크리에이터 수익)
   ⚠️ GP는 판매하지 않는다 — 충전 버튼은 "모으는 법" 안내로만 간다.
   실동작: GC 충전=갈라페이 공용 시트(charge.js, gc_charge_begin pending),
   카드별 최근 내역 미리보기 + GC 결제 대기 배지 + 카운트업.
   정본 정책: docs/currency-policy.md
========================================================= */
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
/* 숫자 카운트업 (easeOutCubic) — <el>의 첫 텍스트노드만 갱신 */
function countUp(el, to, prefix='', suffix=''){
  if(!el) return;
  if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches){
    el.childNodes[0].textContent = prefix+fmt(to); return;
  }
  const t0=performance.now(), dur=800;
  (function tick(t){
    const k=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-k,3);
    el.childNodes[0].textContent = prefix+fmt(Math.round(to*e));
    if(k<1) requestAnimationFrame(tick);
  })(t0);
}

document.addEventListener('DOMContentLoaded', async () => {
  supa = await waitForSupabaseClient();
  const { data } = await supa.auth.getSession();
  ME = data?.session?.user || null;
  if(!ME){
    if(confirm('로그인이 필요합니다. 로그인 페이지로 이동할까요?')) (window.GALLA_nav||function(u){location.href=u})('login.html');
    else (window.GALLA_nav||function(u){location.href=u})('settings.html');
    return;
  }
  bind();
  await Promise.all([loadGp(), loadGc(), loadEarn(), loadPending()]);
});

function bind(){
  /* 🪙 GP는 판매하지 않는다 — 충전 대신 "모으는 법"으로 보낸다. */
  $('wlChargeBtn').onclick = () => {
    if(window.GALLA_needGP) window.GALLA_needGP(0, 'GP는 모아서 써요');
    else alert('GP는 출석·미션·활동으로 모을 수 있어요.');
  };
  /* 💳 GC 충전 = 갈라페이 공용 시트(charge.js). 지갑 전용 시트는 폐지 — 두 벌 유지하다 문구가 어긋났다. */
  $('wlGcChargeBtn').onclick = () => {
    if(window.GALLA_openCharge) window.GALLA_openCharge();
    else alert('충전은 결제 연동 후 열려요.');
  };
}

/* ============ 갈라포인트 ============ */
async function loadGp(){
  const [{ data }, led] = await Promise.all([
    supa.rpc('gp_wallet'),
    supa.from('point_ledger').select('delta,reason,created_at')
      .eq('user_id', ME.id).order('created_at',{ascending:false}).limit(3),
  ]);
  if(!data?.ok) return;
  $('wlGpTotal').innerHTML = `0<small> GP</small>`;
  countUp($('wlGpTotal'), data.total);
  /* 충전 GP 분리 표시는 폐지 — GP를 팔지 않으므로 free/paid를 나눠 보일 이유가 없다.
     (gp_wallet은 여전히 free/paid를 돌려주지만 paid는 0으로 고정된다) */
  renderMini($('wlGp'), led.data||[], gpLabel);
}
const GP_LABELS = [
  [/^predict:bet$/,['🎯','예측 참여']],[/^predict:win$/,['🏆','예측 적중']],
  [/^predict:combo$/,['🔥','연승 보너스']],[/^predict:refund$/,['↩️','예측 환불']],
  [/^daily/,['🪙','출석 보상']],[/^mission:/,['✅','미션 보상']],
  [/^shop:/,['🛒','상점 구매']],
  [/^support:/,['⚔️','진영 밀어주기']],[/^gacha_win/,['🎁','뽑기 대성공']],[/^gacha/,['🎰','갈라 뽑기']],
  [/^issue_win/,['🏅','이슈 승리']],[/^duel/,['🥊','일기토']],
  [/^tip:/,['📸','제보 보상']],[/^boost:/,['🚀','부스트']],[/^nickstyle:/,['🎨','닉 스타일']],
];
function gpLabel(r){ for(const [re,v] of GP_LABELS){ if(re.test(r.reason||'')) return v; } return ['🪙', r.reason||'기타']; }
function gcLabel(r){ return r.reason==='gc:charge' ? ['💳','코인 충전'] : ['💝','크리에이터 후원']; }

/* 카드 하단 최근 내역 3건 미리보기 */
function renderMini(card, rows, labelFn){
  if(!rows.length) return;
  const box=document.createElement('div');
  box.className='wl-mini';
  box.innerHTML = `<div class="wl-mini-h">최근 내역</div>` + rows.map(r=>{
    const [ic,t]=labelFn(r);
    const plus=r.delta>=0;
    return `<div class="wl-mini-row">
      <span>${ic} ${esc(t)}</span>
      <span class="wl-mini-r"><b class="${plus?'up':'down'}">${plus?'+':''}${fmt(r.delta)}</b><small>${ago(r.created_at)}</small></span>
    </div>`;
  }).join('');
  card.querySelector('.wl-btns').before(box);
}

/* ============ 갈라코인 ============ */
async function loadGc(){
  const [{ data: bal }, led] = await Promise.all([
    supa.rpc('gc_balance'),
    supa.from('gc_ledger').select('delta,reason,created_at')
      .eq('user_id', ME.id).order('created_at',{ascending:false}).limit(3),
  ]);
  $('wlGcBal').innerHTML = `0<small> GC</small>`;
  countUp($('wlGcBal'), bal||0);
  renderMini($('wlGc'), led.data||[], gcLabel);
}

/* ============ 결제 대기(pending) 배지 ============ */
async function loadPending(){
  /* GP 충전은 봉인됐다 — gp_charges 배지는 더 보여줄 필요가 없다(남은 pending은 취소 처리됨). */
  const gc = await supa.from('gc_charges').select('id',{count:'exact',head:true})
    .eq('user_id',ME.id).eq('status','pending');
  const n = gc.count||0;
  if(n>0){ const s=document.createElement('span'); s.className='wl-pend'; s.textContent=`결제 대기 ${n}`; $('wlGcChargeBtn').after(s); }
}

/* ============ 크리에이터 수익 ============ */
async function loadEarn(){
  const { data } = await supa.rpc('my_creator_earnings');
  if(!data?.ok) return;
  if((data.total_net||0) <= 0 && (data.withdrawn||0) <= 0) return;
  $('wlEarn').hidden = false;
  $('wlEarnAvail').innerHTML = `₩0<small> 출금 가능</small>`;
  countUp($('wlEarnAvail'), data.available, '₩');
  $('wlEarnDetail').innerHTML =
    `<span>누적 수익 <b>₩${fmt(data.total_net)}</b></span>
     <span>출금 완료 <b>₩${fmt(data.withdrawn)}</b></span>
     ${data.pending>0?`<span>처리 중 <b>₩${fmt(data.pending)}</b></span>`:''}`;
}

/* GC 충전 시트는 갈라페이 공용 시트(js/charge.js)로 통합됐다.
   여기 있던 openGcCharge/closeGcCharge + 채널판별은 중복이라 삭제 — charge.js가 단일 출처다. */
