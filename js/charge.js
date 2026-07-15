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
      .chg-dim{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:12000;opacity:0;transition:opacity .2s}
      .chg-dim.open{opacity:1}
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
    const { data } = await sb().rpc("charge_packages");
    const pkgs = data?.packages || []; firstBonus = !!data?.first_charge;
    sheet.innerHTML = `
      <div class="chg-grip"></div>
      <div class="chg-title">💳 GP 충전</div>
      <div class="chg-sub">GP로 아이템·꾸미기·밀어주기·가챠를 이용해요</div>
      ${ctx?.need ? `<div class="chg-need">${ctx.label || "GP가 부족해요"} · ${gp(ctx.need)} 필요</div>` : ""}
      ${firstBonus ? `<div class="chg-first">🎉 첫 충전 한정 +50% 보너스!</div>` : ""}
      <div class="chg-grid">${pkgs.map(p => {
        const first = firstBonus ? Math.round(p.gp * 0.5) : 0;
        const total = p.gp + p.bonus + first;
        return `<button class="chg-pkg" data-key="${p.key}">
          <span><span class="g">${gp(total)}</span>${p.bonus ? `<span class="b">${p.label || "+보너스"}</span>` : ""}${first ? `<span class="fb">첫충전 +${first.toLocaleString()}</span>` : ""}</span>
          <span class="p">${won(p.krw)}</span>
        </button>`;
      }).join("")}</div>
      <div class="chg-note">갈라포인트(GP)는 서비스 내 놀이 재화로 <b>환급·환전·양도가 불가</b>하며,
        크리에이터 후원 재화인 갈라코인(GC)과 <b>상호 전환되지 않습니다</b>.<br>
        충전 GP는 <b>아이템·꾸미기·가챠·밀어주기</b>에 사용되며 <b>예측·일기토에는 사용할 수 없어요</b>
        (게임은 출석·미션으로 받는 무료 GP로!).<br>
        충전 GP는 랭킹(누적 획득)에 반영되지 않아요. · 결제 연동은 준비 중입니다.</div>`;
    sheet.querySelectorAll(".chg-pkg").forEach(b => b.addEventListener("click", () => begin(b.dataset.key)));
  }
  async function begin(key) {
    const { data, error } = await sb().rpc("charge_begin", { p_key: key });
    if (error || !data?.ok) { alert("충전 준비에 실패했어요."); return; }
    window.BattleFX?.haptic?.("tap");
    sheet.innerHTML = `
      <div class="chg-grip"></div>
      <div class="chg-done">
        <div class="ic">💳</div>
        <h4>${gp(data.total)} 충전 준비 완료</h4>
        <p>${won(data.krw)} 결제로 <b>${gp(data.total)}</b>가 충전됩니다.${data.first_charge ? "<br>🎉 첫 충전 +50% 보너스 포함!" : ""}<br>
        카드·간편결제 연동이 완료되면 즉시 지급됩니다. <b>(PG 연동 예정)</b></p>
      </div>
      <button class="chg-close" id="chg-close">닫기</button>`;
    sheet.querySelector("#chg-close").addEventListener("click", close);
  }
  function open() { dim.classList.add("open"); requestAnimationFrame(() => sheet.classList.add("open")); }
  function close() { sheet?.classList.remove("open"); dim?.classList.remove("open"); }

  window.GALLA_openCharge = function (ctx) { build(); render(ctx || {}); open(); };
  window.GALLA_needGP = function (need, label) { window.GALLA_openCharge({ need, label: label || "GP가 부족해요" }); };
})();
