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

  const NOTE_BASE =
    `갈라코인(GC)은 서비스 내 재화로 <b>환전·양도가 불가</b>합니다 (1원 = 1GC). 쓰고 남은 GC는 잔액으로 남아요.<br>
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
      ctx, NOTE_BASE + `<br>결제(PG) 연동은 준비 중 — 지금은 충전 요청까지 접수됩니다.`);

    sheet.querySelectorAll(".chg-pkg").forEach(b =>
      b.addEventListener("click", () => begin(b, ch)));
  }

  // 웹 PG: 서버에 pending 충전 생성. 실제 카드/간편결제는 PG(토스) 연동 스위치 후 즉시 지급.
  async function begin(btn, ch) {
    window.BattleFX?.haptic?.("tap");
    btn.disabled = true;
    const { data, error } = await sb().rpc("gc_charge_begin", { p_key: btn.dataset.key, p_channel: ch });
    if (error || !data?.ok) { alert("충전 준비에 실패했어요."); btn.disabled = false; return; }
    sheet.innerHTML = doneHTML("💳", "충전이 준비되었습니다",
      `${won(data.krw)} 결제로 <b>${gc(data.gc)}</b>가 충전됩니다.<br>
       카드·간편결제 연동이 완료되면 결제 후<br>즉시 지갑에 들어옵니다. <b>(PG 연동 예정)</b>`);
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
