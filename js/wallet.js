/* =========================================================
   wallet.js — 내 지갑 (GP 무료/충전 · 갈라코인 · 크리에이터 수익)
   실동작: GP 충전=공용 시트(charge.js), GC 충전=자체 시트(gc_charge_begin pending),
   카드별 최근 내역 미리보기 + 결제 대기 배지 + 카운트업.
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
    if(confirm('로그인이 필요합니다. 로그인 페이지로 이동할까요?')) location.href='login.html';
    else location.href='settings.html';
    return;
  }
  bind();
  await Promise.all([loadGp(), loadGc(), loadEarn(), loadPending()]);
});

function bind(){
  $('wlChargeBtn').onclick = () => {
    if(window.GALLA_openCharge) window.GALLA_openCharge();
    else alert('충전은 결제 연동 후 열려요.');
  };
  $('wlGcChargeBtn').onclick = openGcCharge;
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
  if(data.paid > 0){
    $('wlGpSplit').hidden = false;
    $('wlGpFree').textContent = fmt(data.free);
    $('wlGpPaid').textContent = fmt(data.paid);
  }
  renderMini($('wlGp'), led.data||[], gpLabel);
}
const GP_LABELS = [
  [/^predict:bet$/,['🎯','예측 참여']],[/^predict:win$/,['🏆','예측 적중']],
  [/^predict:combo$/,['🔥','연승 보너스']],[/^predict:refund$/,['↩️','예측 환불']],
  [/^daily/,['🪙','출석 보상']],[/^mission:/,['✅','미션 보상']],
  [/^shop:/,['🛒','상점 구매']],[/^charge:/,['💳','GP 충전']],
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
  const [gp, gc] = await Promise.all([
    supa.from('gp_charges').select('id',{count:'exact',head:true}).eq('user_id',ME.id).eq('status','pending'),
    supa.from('gc_charges').select('id',{count:'exact',head:true}).eq('user_id',ME.id).eq('status','pending'),
  ]);
  const mark=(btn,n)=>{ if(n>0){ const s=document.createElement('span'); s.className='wl-pend'; s.textContent=`결제 대기 ${n}`; btn.after(s); } };
  mark($('wlChargeBtn'), gp.count||0);
  mark($('wlGcChargeBtn'), gc.count||0);
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

/* ============ GC 충전 시트 (실동작: gc_charge_begin → pending) ============ */
let gcDim=null, gcSheet=null;

/* 결제 채널 판별 — 인앱 결제는 스토어 수수료(30%)가 붙는다.
   Capacitor 네이티브 래퍼 안이면 그 플랫폼을, 아니면 'web'을 돌려준다.
   ⚠️ 여기 값이 서버 요율표(app_settings.charge_fees)의 키와 맞아야 한다: web/ios/android */
function gcCharChannel(){
  try{
    const cap = window.Capacitor;
    if(cap && (cap.isNativePlatform?.() || cap.isNative)){
      const p = (cap.getPlatform?.() || '').toLowerCase();
      if(p==='ios' || p==='android') return p;
    }
  }catch(_){}
  return 'web';
}
async function openGcCharge(){
  if(!gcSheet){
    gcDim=document.createElement('div'); gcDim.className='wl-dim';
    gcSheet=document.createElement('div'); gcSheet.className='wl-sheet';
    document.body.appendChild(gcDim); document.body.appendChild(gcSheet);
    gcDim.onclick=closeGcCharge;
  }
  gcSheet.innerHTML=`<div class="wl-grip"></div><div class="wl-sheet-t">💝 갈라코인 충전</div>
    <div class="wl-sheet-s">크리에이터 후원 전용 · 갈라포인트와 상호 전환 불가</div>
    <div class="wl-loading">패키지 불러오는 중…</div>`;
  gcDim.classList.add('open');
  requestAnimationFrame(()=>gcSheet.classList.add('open'));

  // 결제 채널. 코인은 어디서 사든 1개=1원(round).
  // ⚠️ 앱스토어 심사(anti-steering): 앱 안에서 "웹이 더 싸다"·외부 결제 유도·가격 비교는
  //    애플·구글 거절 1순위다. 그래서 네이티브에서는 web_krw 비교나 웹 유도 문구를 절대 렌더하지 않는다.
  //    네이티브 결제가 실제로 열릴 땐 스토어 IAP를 써야 한다(우리 PG로 인앱 판매 불가).
  const channel = gcCharChannel();
  const isNative = channel!=='web';
  const { data } = await supa.rpc('gc_charge_packages', { p_channel: channel });
  const pkgs = data?.packages||[];
  gcSheet.innerHTML=`<div class="wl-grip"></div><div class="wl-sheet-t">💝 갈라코인 충전</div>
    <div class="wl-sheet-s">1코인 = 1원 · 크리에이터 후원 전용 · 갈라포인트와 상호 전환 불가</div>
    <div class="wl-pkgs">${pkgs.map(p=>`
      <button class="wl-pkg" data-key="${esc(p.key)}">
        <span class="wl-pkg-g">💝 ${fmt(p.gc)} GC</span>
        <span class="wl-pkg-k">₩${fmt(p.krw)}</span>
      </button>`).join('')}</div>
    <div class="wl-sheet-note">갈라코인은 후원 외에 사용할 수 없고, 갈라포인트와 서로 바꿀 수 없습니다.<br>${isNative ? '앱스토어 결제 연동은 준비 중이에요.' : '결제(PG) 연동은 준비 중 — 지금은 충전 요청까지 접수됩니다.'}</div>`;
  gcSheet.querySelectorAll('.wl-pkg').forEach(b=>b.onclick=async ()=>{
    // 네이티브(iOS/안드로이드)에서는 우리 PG로 인앱 판매하면 스토어 심사에 걸린다.
    // 스토어 IAP 연동 전까지는 결제 자체를 진행하지 않는다(웹 유도 문구도 금지라 넣지 않음).
    if(isNative){
      alert('앱스토어 결제 연동을 준비 중이에요. 조금만 기다려 주세요.');
      return;
    }
    b.disabled=true;
    const { data: r, error } = await supa.rpc('gc_charge_begin',{ p_key:b.dataset.key, p_channel:channel });
    if(error||!r?.ok){ alert('충전 준비에 실패했어요.'); b.disabled=false; return; }
    gcSheet.innerHTML=`<div class="wl-grip"></div>
      <div class="wl-sheet-done">
        <div class="ic">💳</div>
        <h4>충전이 준비되었습니다</h4>
        <p>₩${fmt(r.krw)} → <b>${fmt(r.gc)} GC</b> 충전 요청이 접수됐어요.<br>
        카드·간편결제 연동이 완료되면 결제 후<br>즉시 지갑에 들어옵니다. <b>(PG 연동 예정)</b></p>
      </div>
      <button class="wl-btn" id="wlGcClose" style="width:100%">닫기</button>`;
    $('wlGcClose').onclick=closeGcCharge;
    // 대기 배지 갱신
    document.querySelectorAll('.wl-pend').forEach(e=>e.remove());
    loadPending();
  });
}
function closeGcCharge(){
  gcSheet?.classList.remove('open'); gcDim?.classList.remove('open');
}
