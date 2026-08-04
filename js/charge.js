/* =========================================================
   💳 GP 충전 (현금→GP) — PG 연결 직전까지.
   - window.GALLA_openCharge({need,label}?) : 충전 시트
   - window.GALLA_needGP(need, label) : "GP 부족" → 충전 유도 (막다른 골목 제거)
   - charge_begin(pending) → 결제(PG 연동 예정) → charge_confirm(GP 지급)
   ========================================================= */
(function () {
  const sb = () => window.supabaseClient;
  const gp = (n) => (n || 0).toLocaleString() + " GP";
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
      .chg-first{background:linear-gradient(135deg,#ff6a88,#ff4d6d);color:#fff;border-radius:12px;padding:10px 12px;
        font-size:13px;font-weight:900;text-align:center;margin-bottom:12px}
      .chg-grid{display:flex;flex-direction:column;gap:9px}
      .chg-pkg{display:flex;align-items:center;gap:12px;background:#1c1d23;border:1px solid rgba(255,255,255,.1);
        border-radius:14px;padding:13px 14px;cursor:pointer;transition:.12s}
      .chg-pkg:active{transform:scale(.99)}
      .chg-pkg .g{font-size:16px;font-weight:900;color:#fff}
      .chg-pkg .b{font-size:12px;font-weight:800;color:#5ce09a;margin-left:6px}
      .chg-pkg .fb{font-size:11px;font-weight:800;color:#ff8fa3;margin-left:6px}
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

  let dim, sheet, firstBonus = false;
  function build() {
    if (sheet) return; css();
    dim = document.createElement("div"); dim.className = "chg-dim";
    sheet = document.createElement("div"); sheet.className = "chg-sheet";
    document.body.appendChild(dim); document.body.appendChild(sheet);
    dim.addEventListener("click", close);
  }
  async function render(ctx) {
    // 🍎 앱스토어/플레이 anti-steering: 네이티브에선 원화 가격·패키지를 절대 렌더하지 않는다(IAP 붙기 전까지).
    //    실제 결제만 막는 게 아니라 '원화 표시' 자체가 외부결제 유도로 거절 사유가 된다.
    const isApp = window.GALLA_isApp && window.GALLA_isApp();
    firstBonus = false;
    let bodyHTML;
    if (isApp) {
      bodyHTML = `
        <div class="chg-soon">📱 앱 내 충전은 <b>다음 업데이트</b>에서 열려요.<br>
          지금은 <b>출석·데일리 미션·예측</b>으로 GP를 모을 수 있어요!</div>`;
    } else {
      const { data } = await sb().rpc("charge_packages");
      const pkgs = data?.packages || []; firstBonus = !!data?.first_charge;
      bodyHTML = `
        ${firstBonus ? `<div class="chg-first">🎉 첫 충전 한정 +50% 보너스!</div>` : ""}
        <div class="chg-grid">${pkgs.map(p => {
          const first = firstBonus ? Math.round(p.gp * 0.5) : 0;
          const total = p.gp + p.bonus + first;
          return `<button class="chg-pkg" data-key="${p.key}">
            <span><span class="g">${gp(total)}</span>${p.bonus ? `<span class="b">${p.label || "+보너스"}</span>` : ""}${first ? `<span class="fb">첫충전 +${first.toLocaleString()}</span>` : ""}</span>
            <span class="p">${won(p.krw)}</span>
          </button>`;
        }).join("")}</div>`;
    }
    sheet.innerHTML = `
      <div class="chg-grip"></div>
      <div class="chg-title">💳 GP 충전</div>
      <div class="chg-sub">GP로 아이템·꾸미기·밀어주기·가챠를 이용해요</div>
      ${ctx?.need ? `<div class="chg-need">${ctx.label || "GP가 부족해요"} · ${gp(ctx.need)} 필요</div>` : ""}
      ${bodyHTML}
      <div class="chg-note">갈라포인트(GP)는 서비스 내 놀이 재화로 <b>환급·환전·양도가 불가</b>하며,
        크리에이터 후원 재화인 갈라코인(GC)과 <b>상호 전환되지 않습니다</b>.<br>
        충전 GP는 <b>아이템·꾸미기·가챠·밀어주기</b>에 사용되며 <b>예측·일기토에는 사용할 수 없어요</b>
        (게임은 출석·미션으로 받는 무료 GP로!).<br>
        충전 GP는 랭킹(누적 획득)에 반영되지 않아요.${isApp ? "" : " · 결제 연동은 준비 중입니다."}</div>`;
    if (!isApp) sheet.querySelectorAll(".chg-pkg").forEach(b => b.addEventListener("click", () => begin(b.dataset.key)));
  }
  async function begin(key) {
    window.BattleFX?.haptic?.("tap");
    const isApp = window.GALLA_isApp && window.GALLA_isApp();
    // 📱 앱: 스토어 인앱결제(IAP) — 애플/구글 정책상 앱 내 GP는 IAP 필수.
    if (isApp) return beginIAP(key);
    // 🌐 웹: PG 결제(토스 등) — 웹은 IAP 대상 아님. (PG 연동 스위치 대기)
    return beginPG(key);
  }

  /* 인앱결제: 네이티브 결제 플러그인으로 구매 → 스토어 영수증 → verify-iap(서버 검증·지급).
     ⚠️ 실제 결제 호출은 Capacitor IAP 플러그인이 앱에 포함돼야 동작(네이티브 빌드 과제).
     플러그인이 없으면 안내만 — 클라가 임의로 GP를 지급할 방법은 없다(서버가 영수증으로만 지급). */
  async function beginIAP(key) {
    const IAP = window.CdvPurchase || (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.InAppPurchases);
    if (!IAP) {
      sheet.innerHTML = doneHTML("📱", "결제 준비 중",
        "이 버전에는 인앱결제 모듈이 아직 포함되지 않았어요.<br>다음 앱 업데이트에서 충전이 열립니다.");
      bindClose(); return;
    }
    try {
      // 실제 결제 플로우(플러그인 계약에 맞춰 네이티브 확정 지점):
      //   const receipt = await IAP.purchase(iosProductIdByKey(key));
      //   const out = await window.GALLA_verifyPurchase('apple', { receipt, productId });
      // 성공 시 out.ok → 지급 완료 토스트 + points-changed 이벤트.
      sheet.innerHTML = doneHTML("📱", "결제 준비 중",
        "인앱결제 연결은 다음 앱 빌드에서 활성화됩니다.");
      bindClose();
    } catch (e) {
      sheet.innerHTML = doneHTML("⚠️", "결제 실패", "결제를 완료하지 못했어요. 다시 시도해 주세요.");
      bindClose();
    }
  }

  // 웹 PG: 서버에 pending 충전 생성. 실제 카드/간편결제는 PG(토스) 연동 스위치 후 즉시 지급.
  async function beginPG(key) {
    const { data, error } = await sb().rpc("charge_begin", { p_key: key });
    if (error || !data?.ok) { alert("충전 준비에 실패했어요."); return; }
    sheet.innerHTML = doneHTML("💳", `${gp(data.total)} 충전 준비 완료`,
      `${won(data.krw)} 결제로 <b>${gp(data.total)}</b>가 충전됩니다.${data.first_charge ? "<br>🎉 첫 충전 +50% 보너스 포함!" : ""}<br>카드·간편결제 연동이 완료되면 즉시 지급됩니다. <b>(PG 연동 예정)</b>`);
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
  window.GALLA_needGP = function (need, label) { window.GALLA_openCharge({ need, label: label || "GP가 부족해요" }); };
})();
