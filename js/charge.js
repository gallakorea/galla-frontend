/* =========================================================
   💳 갈라페이 — 충전 시트 (현금 → GC). PG 연결 직전까지.

   ⚠️ GP는 판매하지 않는다(정책 확정).
      GP = 출석·미션·활동으로만 모으는 게임 재화. 예측·일기토·가챠·아이템은 GP로만.
      GC = 실제 돈이 나가는 것(AI 창작·갈비스 고급 모델·크리에이터 후원)에만 쓰는 충전 재화.
      둘은 상호 전환되지 않는다.

   - window.GALLA_openCharge()        : 갈라페이 충전 시트(GC)
   - window.GALLA_needGC(need, label) : GC 부족 → 충전 시트
   - window.GALLA_needGP(need, label) : GP 부족 → "모으는 법" 안내 (충전 아님)
   - gc_charge_begin(pending) → 결제(PG 연동 예정) → gc_charge_confirm(GC 지급)

   레거시 GP 충전(charge_begin/charge_confirm/charge_packages)은 서버에서 실행 권한을
   회수해 봉인했다 — 되살리려면 정책 재결정이 먼저다.
   ========================================================= */

/* 💳 포트원(PortOne) 결제 설정 — 여기가 단일 출처다.
   ⚠️ 2026-09-06 이전엔 js/config.js 에 있었는데, config.js 를 로드하는 HTML 은
      charge-return.html 뿐이었다. 정작 충전 시트가 뜨는 mypage·wallet·issue·settings 에는
      안 실려서 window.GALLA_PORTONE 이 undefined → payReady() false →
      **채널키를 넣어도 계속 '준비 중'으로 떨어질 구조였다.** 유일한 소비자인 이 파일로 옮겨
      로드 순서 함정을 없앤다. (config.js 의 window.CONFIG 는 어디서도 쓰지 않는 사문이다.)
   ⚠️ storeId·channelKey 는 공개돼도 되는 식별자다(비밀키가 아니다).
      실제 지급 권한은 서버(portone-webhook + PORTONE_API_SECRET)에만 있다.
   ⚠️ 아래는 KG이니시스 **테스트** 채널(inicis_v2, 포트원 공용 MID INIpayTest)이다.
      포트원은 심사 전에 테스트 연동이 도는 걸 요구한다 — 계약 없이 콘솔에서 채널만 추가하면 된다.
      실계약이 끝나면 실연동 채널을 만들어 channelKey 한 줄만 갈아끼운다.
   조회 위치: 포트원 관리자콘솔 > 결제연동 > 연동 정보 */
window.GALLA_PORTONE = {
  storeId: "store-1638c847-0fa6-42ee-9110-dc37c31ddf1b",
  channelKey: "channel-key-2f10aadc-7c38-4a11-a167-a919dcd21f19",  // KG이니시스 테스트(inicis_v2)
};

(function () {
  const sb = () => window.supabaseClient;
  const gc = (n) => (n || 0).toLocaleString() + " GC";
  const won = (n) => (n || 0).toLocaleString() + "원";

  function css() {
    if (document.getElementById("charge-css")) return;
    const s = document.createElement("style"); s.id = "charge-css";
    s.textContent = `
      .chg-dim{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:12000;opacity:0;pointer-events:none;transition:opacity .2s}
      .chg-dim.open{opacity:1;pointer-events:auto}
      .chg-sheet{position:fixed;left:0;right:0;bottom:0;z-index:12001;background:#15161b;border-radius:20px 20px 0 0;
        border-top:1px solid rgba(255,255,255,.1);padding:16px 16px calc(16px + env(safe-area-inset-bottom));max-width:520px;margin:0 auto;
        transform:translateY(100%);transition:transform .26s cubic-bezier(.2,.8,.2,1);max-height:90vh;overflow:auto}
      .chg-sheet.open{transform:translateY(0)}
      .chg-grip{width:38px;height:4px;border-radius:2px;background:rgba(255,255,255,.25);margin:2px auto 12px}
      .chg-title{font-weight:900;font-size:18px;color:#fff;text-align:center}
      .chg-sub{font-size:12.5px;color:#8a8f9a;text-align:center;margin:5px 0 14px}
      .chg-need{background:rgba(201,209,224,.12);border:1px solid rgba(201,209,224,.3);color:#c9d1e0;
        border-radius:12px;padding:10px 12px;font-size:13px;font-weight:800;text-align:center;margin-bottom:12px}
      .chg-bal{font-size:12px;color:#8a8f9a;text-align:center;margin:-6px 0 12px}
      .chg-bal b{color:#c9d1e0}
      .chg-grid{display:flex;flex-direction:column;gap:9px}
      .chg-pkg{display:flex;align-items:center;gap:12px;background:#1c1d23;border:1px solid rgba(255,255,255,.1);
        border-radius:14px;padding:13px 14px;cursor:pointer;transition:.12s}
      .chg-pkg:active{transform:scale(.99)}
      .chg-pkg[disabled]{opacity:.5;cursor:default}
      .chg-pkg .g{font-size:16px;font-weight:900;color:#fff}
      .chg-pkg .b{font-size:12px;font-weight:800;color:#5ce09a;margin-left:6px}
      .chg-pkg .p{margin-left:auto;font-weight:900;font-size:15px;color:#c9d1e0;white-space:nowrap}
      .chg-soon{background:rgba(201,209,224,.1);border:1px solid rgba(201,209,224,.22);border-radius:14px;
        padding:20px 16px;text-align:center;font-size:14px;font-weight:800;color:#c9d1e0;line-height:1.7}
      .chg-note{font-size:11px;color:#6c7280;text-align:center;margin-top:12px;line-height:1.5}
      .chg-done{text-align:center;padding:18px 8px}
      .chg-done .ic{font-size:42px} .chg-done h4{font-size:17px;font-weight:900;color:#fff;margin:10px 0 6px}
      .chg-done p{font-size:13px;color:#9aa0ad;line-height:1.6}
      .chg-close{width:100%;padding:14px;border:none;border-radius:12px;font-weight:900;font-size:15px;cursor:pointer;background:#2a2b31;color:#fff}
    `;
    document.head.appendChild(s);
  }

  /* 결제 채널 — 인앱 결제는 스토어 수수료(30%)가 붙어 서버 요율표가 달라진다.
     ⚠️ 여기 값이 app_settings.charge_fees 키와 맞아야 한다: web/ios/android */
  function channel() {
    try {
      const cap = window.Capacitor;
      if (cap && (cap.isNativePlatform?.() || cap.isNative)) {
        const p = (cap.getPlatform?.() || "").toLowerCase();
        if (p === "ios" || p === "android") return p;
      }
    } catch (_) {}
    return "web";
  }

  let dim, sheet;
  function build() {
    if (sheet) return; css();
    dim = document.createElement("div"); dim.className = "chg-dim";
    sheet = document.createElement("div"); sheet.className = "chg-sheet";
    document.body.appendChild(dim); document.body.appendChild(sheet);
    dim.addEventListener("click", close);
  }

  function shell(bodyHTML, ctx, note) {
    return `
      <div class="chg-grip"></div>
      <div class="chg-title">💳 갈라페이 충전</div>
      <div class="chg-sub">충전하면 갈라코인(GC)이 쌓여요 · AI 창작·갈비스 고급·후원에 사용</div>
      ${ctx?.need ? `<div class="chg-need">${ctx.label || "GC가 부족해요"} · ${gc(ctx.need)} 필요</div>` : ""}
      ${ctx?.bal != null ? `<div class="chg-bal">현재 잔액 <b>${gc(ctx.bal)}</b></div>` : ""}
      ${bodyHTML}
      <div class="chg-note">${note}</div>`;
  }

  /* ⏳ 유효기간 고지는 '결제 직전'에 보여야 고지가 성립한다(약관에만 두면 부족).
     PG 심사도 충전금 유효기간 설정·표시를 통과 조건으로 본다. */
  const NOTE_BASE =
    `갈라코인(GC)은 서비스 내 재화로 <b>환전·양도가 불가</b>합니다 (1원 = 1GC). 쓰고 남은 GC는 잔액으로 남아요.<br>
     충전한 GC의 <b>유효기간은 지급일로부터 5년</b>이에요(소멸 30일 전 알려드려요).<br>
     게임 재화인 <b>갈라포인트(GP)는 판매하지 않아요</b> — 출석·미션·활동으로만 모으고, 예측·일기토·가챠·아이템은 GP로만 참여합니다.<br>
     GC와 GP는 서로 바꿀 수 없습니다.`;

  async function render(ctx) {
    // 🍎 앱스토어/플레이 anti-steering: 네이티브에선 원화 가격·패키지를 절대 렌더하지 않는다(IAP 붙기 전까지).
    //    실제 결제만 막는 게 아니라 '원화 표시' 자체가 외부결제 유도로 거절 사유가 된다.
    const ch = channel();
    const isApp = ch !== "web";

    sheet.innerHTML = shell(`<div class="chg-soon">패키지 불러오는 중…</div>`, ctx, NOTE_BASE);

    if (isApp) {
      sheet.innerHTML = shell(
        `<div class="chg-soon">📱 앱 내 충전은 <b>다음 업데이트</b>에서 열려요.</div>`,
        ctx, NOTE_BASE + `<br>앱스토어 결제 연동은 준비 중이에요.`);
      return;
    }

    /* ⚠️ supabase-js의 rpc()는 thenable이지 Promise가 아니다 — .catch()가 없다.
       Promise.resolve()로 감싸야 실패를 삼킬 수 있다. */
    const [pkgRes, balRes] = await Promise.all([
      Promise.resolve(sb().rpc("gc_charge_packages", { p_channel: ch })).catch(() => ({ data: null })),
      Promise.resolve(sb().rpc("gc_balance")).catch(() => ({ data: null })),
    ]);
    const pkgs = pkgRes?.data?.packages || [];
    if (ctx && ctx.bal == null && balRes?.data != null) ctx.bal = balRes.data;

    if (!pkgs.length) {
      sheet.innerHTML = shell(`<div class="chg-soon">지금은 충전 패키지를 불러올 수 없어요.<br>잠시 후 다시 시도해 주세요.</div>`, ctx, NOTE_BASE);
      return;
    }

    sheet.innerHTML = shell(
      `<div class="chg-grid">${pkgs.map(p => `
        <button class="chg-pkg" data-key="${p.key}">
          <span><span class="g">${gc(p.gc)}</span>${p.label ? `<span class="b">${p.label}</span>` : ""}</span>
          <span class="p">${won(p.krw)}</span>
        </button>`).join("")}</div>`,
      ctx, NOTE_BASE + payNote());

    sheet.querySelectorAll(".chg-pkg").forEach(b =>
      b.addEventListener("click", () => begin(b, ch)));
  }

  /* 결제 준비 여부는 채널키 유무로 판단한다 — PG 심사가 끝나 채널키가 꽂히면
     별도 배포 없이 결제가 열린다(app_settings 가 아니라 config 상수라 캐시 이슈가 없다). */
  function payReady() { return !!(window.GALLA_PORTONE && window.GALLA_PORTONE.channelKey); }
  function payNote() {
    return payReady()
      ? `<br>카드·간편결제(카카오페이·네이버페이·토스페이 등)로 결제하면 <b>즉시</b> 지갑에 들어옵니다.`
      : `<br>결제(PG) 연동은 준비 중 — 지금은 충전 요청까지 접수됩니다.`;
  }

  /* 웹 PG(포트원) 결제.
     ① 서버가 pending 충전을 만들고 charge_id·금액을 정한다 — 클라가 금액을 정하지 않는다.
     ② paymentId 를 charge_id 로 그대로 써서 결제한다 → 웹훅이 우리 건을 바로 찾는다.
     ③ 지급은 클라가 아니라 portone-webhook 이 포트원 API 에 되물어 확인한 뒤에만 한다.
        여기서 "성공"을 받아도 그건 화면 안내용일 뿐, 잔액의 근거가 아니다. */
  async function begin(btn, ch) {
    window.BattleFX?.haptic?.("tap");
    btn.disabled = true;

    const { data, error } = await sb().rpc("gc_charge_begin", { p_key: btn.dataset.key, p_channel: ch });
    if (error || !data?.ok) { alert("충전 준비에 실패했어요."); btn.disabled = false; return; }

    if (!payReady()) {
      sheet.innerHTML = doneHTML("💳", "충전이 준비되었습니다",
        `${won(data.krw)} 결제로 <b>${gc(data.gc)}</b>가 충전됩니다.<br>
         카드·간편결제 연동이 완료되면 결제 후<br>즉시 지갑에 들어옵니다. <b>(PG 연동 예정)</b>`);
      bindClose();
      return;
    }
    await pay(data);
  }

  /* 결제창 호출. 모바일에선 리다이렉트로 나갔다 돌아온다 —
     iframe 으로 띄우면 카드사·간편결제사 도메인이 전부 CSP frame-src 에 걸린다.
     (국내 PG 결제창은 도메인이 수십 개라 화이트리스트가 현실적으로 불가능하다.) */
  /* SDK(241KB)는 '결제할 때만' 받는다. 이슈 페이지처럼 자주 여는 화면에 항상 얹으면
     결제를 안 하는 대다수가 그 무게를 대신 진다.
     ⚠️ CDN 이 아니라 로컬 벤더링(vendor/portone.js) — script-src 'self' 를 뚫지 않기 위해서다
        (supabase.js 와 같은 수법). */
  let sdkP = null;
  function loadSDK() {
    if (window.PortOne) return Promise.resolve(true);
    if (sdkP) return sdkP;
    sdkP = new Promise(res => {
      const el = document.createElement("script");
      el.src = "/vendor/portone.js?v=0902113";
      el.onload = () => res(!!window.PortOne);
      el.onerror = () => res(false);
      document.head.appendChild(el);
    });
    return sdkP;
  }

  async function pay(chg) {
    const cfg = window.GALLA_PORTONE || {};
    sheet.innerHTML = doneHTML("💳", "결제 준비 중…", won(chg.krw) + " · " + gc(chg.gc));
    if (!(await loadSDK())) {
      sheet.innerHTML = doneHTML("⚠️", "결제 모듈을 불러오지 못했어요",
        "네트워크를 확인하고 다시 시도해 주세요.");
      bindClose();
      return;
    }

    sheet.innerHTML = doneHTML("💳", "결제창을 여는 중…", `${won(chg.krw)} · ${gc(chg.gc)}`);

    /* 🧾 이니시스 V2 일반결제는 구매자 **이메일과 휴대폰 번호가 둘 다 필수**다.
       하나씩 빠뜨릴 때마다 결제창이 아예 안 뜨고 그 필드를 요구하며 끝난다(실측 2026-09-06:
       "구매자 이메일은 필수 입력입니다" → 넣으니 "구매자 휴대폰 번호는 필수 입력입니다").
       이메일: 소셜이 안 주면 우리 합성 주소(naver_*@galla.social)가 들어가는데 형식이 유효해 통과한다.
       전화: 온보딩에서 선택값이라 **32명 중 28명이 비어 있다**(실측). 프로필에 기대면
             대다수가 결제를 못 하므로, 없으면 이 시트에서 직접 받는다. */
    let acct = null;
    try { const { data } = await sb().rpc("get_my_account"); acct = data || null; } catch (_) {}

    let buyerEmail = (acct && acct.email) || "";
    if (!buyerEmail) {
      try { const { data: u } = await sb().auth.getUser(); buyerEmail = (u && u.user && u.user.email) || ""; } catch (_) {}
    }
    if (!buyerEmail) {
      sheet.innerHTML = doneHTML("⚠️", "결제를 시작할 수 없어요",
        "계정 이메일을 확인하지 못했어요.<br>다시 로그인한 뒤 시도해 주세요.");
      bindClose();
      return;
    }

    let buyerPhone = onlyDigits((acct && acct.phone) || "");
    if (!validPhone(buyerPhone)) {
      buyerPhone = await askPhone(chg);
      if (!buyerPhone) return;              // 취소 — 안내는 askPhone 이 이미 그렸다
    }
    const buyerName = (acct && acct.nickname) || "";

    const back = location.origin + "/charge-return.html?cid=" + encodeURIComponent(chg.charge_id);
    let res;
    try {
      res = await window.PortOne.requestPayment({
        storeId: cfg.storeId,
        channelKey: cfg.channelKey,
        paymentId: chg.charge_id,          // = gc_charges.id · 웹훅이 이걸로 찾는다
        orderName: "갈라캐시 " + Number(chg.gc).toLocaleString() + "GC",
        totalAmount: chg.krw,
        currency: "CURRENCY_KRW",
        payMethod: "CARD",
        customer: Object.assign({ email: buyerEmail, phoneNumber: buyerPhone }, buyerName ? { fullName: buyerName } : {}),
        redirectUrl: back,
      });
    } catch (e) {
      res = { code: "ERROR", message: String(e && e.message || e) };
    }

    /* 사용자가 창을 닫거나 카드사에서 실패한 경우. 지급은 애초에 웹훅 소관이라
       여기서 할 일은 안내뿐이다. pending 행은 남지만 미결제로 만료된다. */
    if (res && res.code) {
      sheet.innerHTML = doneHTML("⚠️", "결제가 완료되지 않았어요",
        (res.message || "결제가 취소되었습니다.") + "<br>다시 시도해 주세요.");
      bindClose();
      return;
    }
    await settle(chg);
  }

  /* 결제창이 성공으로 닫혀도 웹훅이 아직 안 왔을 수 있다.
     잔액이 실제로 오를 때까지 짧게 폴링한다 — '결제했는데 잔액 그대로'를 막는다. */
  async function settle(chg) {
    sheet.innerHTML = doneHTML("⏳", "결제 확인 중…", "잠시만 기다려 주세요.");
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const { data } = await Promise.resolve(sb().rpc("gc_charge_status", { p_charge_id: chg.charge_id }))
        .catch(() => ({ data: null }));
      if (data && data.status === "paid") {
        document.dispatchEvent(new Event("galla:points-changed"));
        sheet.innerHTML = doneHTML("✅", "충전 완료",
          `<b>${gc(chg.gc)}</b>가 지갑에 들어왔어요.`);
        bindClose();
        return;
      }
    }
    /* 웹훅이 늦을 뿐 결제는 됐을 수 있다 — 실패로 단정하지 않는다. */
    sheet.innerHTML = doneHTML("⏳", "결제 확인이 지연되고 있어요",
      "결제는 정상 접수되었어요.<br>잠시 후 지갑에서 잔액을 확인해 주세요.<br>계속 반영되지 않으면 고객센터로 알려주세요.");
    bindClose();
  }

  // 스토어 영수증 검증 브리지 — 네이티브 결제 성공 후 호출(공용).
  window.GALLA_verifyPurchase = async function (store, payload) {
    const { data: s } = await sb().auth.getSession();
    const token = s?.session?.access_token;
    const res = await fetch(`${sb().supabaseUrl}/functions/v1/verify-iap`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "apikey": sb().supabaseKey },
      body: JSON.stringify({ store, ...(payload || {}) }),
    });
    const out = await res.json().catch(() => ({ ok: false }));
    if (out.ok) document.dispatchEvent(new Event("galla:points-changed"));
    return out;
  };

  /* 📱 전화번호 — PG 필수값인데 온보딩에선 선택이라 대부분 비어 있다.
     결제 흐름을 끊지 않도록 여기서 받는다. 받은 값은 이 결제 건에만 쓰고 저장하지 않는다
     (PII 를 결제 부수효과로 조용히 쌓지 않는다 — 저장은 설정 화면에서 본인이 하는 일이다). */
  function onlyDigits(s) { return String(s || "").replace(/\D/g, ""); }
  function validPhone(d) { return /^01[016789]\d{7,8}$/.test(d); }

  function askPhone(chg) {
    return new Promise((resolve) => {
      sheet.innerHTML =
        `<div class="chg-grip"></div>
         <div class="chg-done">
           <div class="ic">📱</div>
           <h4>휴대폰 번호를 알려주세요</h4>
           <p>카드사 결제에 필요한 정보예요.<br>${won(chg.krw)} · ${gc(chg.gc)}</p>
         </div>
         <input id="chg-phone" type="tel" inputmode="numeric" autocomplete="tel"
                placeholder="01012345678" maxlength="13"
                style="width:100%;height:52px;margin:4px 0 8px;padding:0 14px;border-radius:12px;
                       border:1px solid rgba(255,255,255,.16);background:#12141a;color:#fff;
                       font-size:16px;text-align:center;letter-spacing:.5px">
         <div id="chg-phone-err" style="min-height:18px;color:#ff7a7a;font-size:12px;text-align:center"></div>
         <button class="chg-close" id="chg-phone-go" style="background:linear-gradient(135deg,#3d6bff,#5a86ff);color:#fff">결제 계속하기</button>
         <button class="chg-close" id="chg-close">취소</button>`;

      const input = sheet.querySelector("#chg-phone");
      const err = sheet.querySelector("#chg-phone-err");
      // 16px 미만이면 iOS 사파리가 화면을 확대해 버린다 — 위 style 의 font-size:16px 은 그 방어다.
      setTimeout(() => input && input.focus(), 60);

      function submit() {
        const d = onlyDigits(input.value);
        if (!validPhone(d)) { err.textContent = "번호를 다시 확인해 주세요 (예: 01012345678)"; return; }
        resolve(d);
      }
      sheet.querySelector("#chg-phone-go").addEventListener("click", submit);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
      sheet.querySelector("#chg-close").addEventListener("click", () => { close(); resolve(""); });
    });
  }

  function doneHTML(ic, title, body) {
    return `<div class="chg-grip"></div><div class="chg-done"><div class="ic">${ic}</div><h4>${title}</h4><p>${body}</p></div><button class="chg-close" id="chg-close">닫기</button>`;
  }
  function bindClose() { sheet.querySelector("#chg-close")?.addEventListener("click", close); }
  function open() { dim.classList.add("open"); requestAnimationFrame(() => sheet.classList.add("open")); }
  function close() { sheet?.classList.remove("open"); dim?.classList.remove("open"); }

  window.GALLA_openCharge = function (ctx) { build(); render(ctx || {}); open(); };
  window.GALLA_needGC = function (need, label) {
    window.GALLA_openCharge({ need, label: label || "GC가 부족해요" });
  };

  /* GP는 판매하지 않으므로 충전 시트로 보내지 않는다 — 모으는 법을 안내한다.
     ⚠️ galla-ask.js는 issue.html에만 있다(wallet/mypage/settings엔 없음).
        그래서 GALLA_ask에 기대지 않고 이 모듈 자체 시트로 그린다 — alert 폴백은 UX가 나쁘다. */
  const EARN_WAYS = [
    ["🪙", "출석 체크", "하루 한 번, 연속일수만큼 더"],
    ["✅", "데일리 미션", "오늘의 미션 완료 보상"],
    ["💬", "활동", "이슈·댓글·투표로 차곡차곡"],
    ["⚔️", "배틀·일기토", "격파하고 관전하고"],
  ];
  window.GALLA_needGP = function (need, label) {
    build();
    const n = Number(need) || 0;
    sheet.innerHTML = `
      <div class="chg-grip"></div>
      <div class="chg-title">🪙 ${label || "GP가 부족해요"}</div>
      <div class="chg-sub">갈라포인트(GP)는 판매하지 않아요 · 모아서 쓰는 재화예요</div>
      ${n ? `<div class="chg-need">${n.toLocaleString()} GP가 더 필요해요</div>` : ""}
      <div class="chg-grid">${EARN_WAYS.map(([ic, t, d]) => `
        <div class="chg-pkg" style="cursor:default">
          <span><span class="g">${ic} ${t}</span><br><span style="font-size:12px;color:#8a8f9a">${d}</span></span>
        </div>`).join("")}</div>
      <div class="chg-note">잔액이 바닥나면 하루 한 번 재기 지원금이 나가요.<br>
        예측·일기토·가챠·아이템은 모두 이 GP로만 참여합니다.</div>
      <button class="chg-close" id="chg-close" style="margin-top:12px">알겠어요</button>`;
    bindClose();
    open();
  };
})();
