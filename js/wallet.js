/* =========================================================
   wallet.js — 내 지갑 (GP 무료/충전 · 갈라코인 · 크리에이터 수익)
   정본 정책: docs/currency-policy.md
========================================================= */
let supa = null, ME = null;
const $ = id => document.getElementById(id);
function fmt(n){ return Math.round(Number(n)||0).toLocaleString('ko-KR'); }

document.addEventListener('DOMContentLoaded', async () => {
  supa = await waitForSupabaseClient();
  const { data } = await supa.auth.getSession();
  ME = data?.session?.user || null;
  if(!ME){
    if(confirm('로그인이 필요합니다. 로그인 페이지로 이동할까요?')) location.href='login.html';
    else location.href='settings.html';
    return;
  }
  bind();
  await Promise.all([loadGp(), loadGc(), loadEarn()]);
});

function bind(){
  // GP 충전 — 공용 충전 시트(charge.js). 충전분은 소비 전용임이 시트에 고지됨.
  $('wlChargeBtn').onclick = () => {
    if(window.GALLA_openCharge) window.GALLA_openCharge();
    else alert('충전은 결제 연동 후 열려요.');
  };
  // GC 충전 — PG 연동 전
  $('wlGcChargeBtn').onclick = () =>
    alert('갈라코인 충전은 결제 연동 후 열려요.\n충전되면 크리에이터 후원에 바로 쓸 수 있습니다.');
}

async function loadGp(){
  const { data } = await supa.rpc('gp_wallet');
  if(!data?.ok) return;
  $('wlGpTotal').innerHTML = `${fmt(data.total)}<small> GP</small>`;
  // 충전 GP가 있을 때만 무료/충전 구분 노출 (없으면 단순하게)
  if(data.paid > 0){
    $('wlGpSplit').hidden = false;
    $('wlGpFree').textContent = fmt(data.free);
    $('wlGpPaid').textContent = fmt(data.paid);
  }
}

async function loadGc(){
  const { data } = await supa.rpc('gc_balance');
  $('wlGcBal').innerHTML = `${fmt(data||0)}<small> GC</small>`;
}

async function loadEarn(){
  // 후원을 받아본 적 있는 사람에게만 수익 카드 노출
  const { data } = await supa.rpc('my_creator_earnings');
  if(!data?.ok) return;
  if((data.total_net||0) <= 0 && (data.withdrawn||0) <= 0) return;
  $('wlEarn').hidden = false;
  $('wlEarnAvail').innerHTML = `₩${fmt(data.available)}<small> 출금 가능</small>`;
  $('wlEarnDetail').innerHTML =
    `<span>누적 수익 <b>₩${fmt(data.total_net)}</b></span>
     <span>출금 완료 <b>₩${fmt(data.withdrawn)}</b></span>
     ${data.pending>0?`<span>처리 중 <b>₩${fmt(data.pending)}</b></span>`:''}`;
  $('wlEarnDetail').hidden = false;
}
