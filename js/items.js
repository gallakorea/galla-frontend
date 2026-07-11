/* =========================================================
   GP 아이템 상점 + 인벤토리
   - 카탈로그는 서버(_item_price)와 동일하게 유지
   - window.openShop() / GALLA_myItems() / GALLA_buyItem(key)
   ========================================================= */
(function () {
  const CATALOG = [
    { key: "cooldown_reset",  emoji: "⚡", name: "쿨다운 리셋권", price: 300,
      desc: "60초 쿨다운을 무시하고 즉시 다시 공격·방어·지원" },
    { key: "infiltrate_pass", emoji: "🕵️", name: "침투권", price: 500,
      desc: "오늘의 적진 침투 한도 +1 (기본 3회)" },
    { key: "revive",          emoji: "✨", name: "부활권", price: 800,
      desc: "격파당한 내 댓글을 HP 50으로 부활" },
  ];
  window.GALLA_ITEM_CATALOG = CATALOG;

  const sb = () => window.supabaseClient;

  window.GALLA_myItems = async function () {
    const { data, error } = await sb().rpc("my_items");
    if (error) { console.error("[items]", error); return {}; }
    return data || {};
  };

  window.GALLA_buyItem = async function (key, qty = 1) {
    const { data, error } = await sb().rpc("buy_item", { p_key: key, p_qty: qty });
    if (error) return { ok: false, reason: "error" };
    return data;
  };

  let sheet = null;
  function build() {
    if (sheet) return sheet;
    sheet = document.createElement("div");
    sheet.id = "gp-shop";
    sheet.className = "shop-sheet";
    sheet.innerHTML = `
      <div class="shop-dim"></div>
      <div class="shop-card" role="dialog" aria-label="GP 상점">
        <div class="shop-grip"></div>
        <div class="shop-head">
          <span class="shop-title">🛒 GP 상점</span>
          <span class="shop-bal" id="shopBal">– GP</span>
        </div>
        <div class="shop-list" id="shopList"></div>
        <div class="shop-note">GP는 출석·데일리 미션·예측으로 모을 수 있어요</div>
      </div>`;
    document.body.appendChild(sheet);
    sheet.querySelector(".shop-dim").addEventListener("click", () => sheet.classList.remove("open"));
    return sheet;
  }

  async function refresh() {
    const [balR, inv] = await Promise.all([
      sb().rpc("ensure_balance"),
      window.GALLA_myItems(),
    ]);
    const bal = Math.round(balR.data || 0);
    const balEl = sheet.querySelector("#shopBal");
    if (balEl) balEl.textContent = bal.toLocaleString() + " GP";

    const list = sheet.querySelector("#shopList");
    list.innerHTML = CATALOG.map(it => {
      const owned = inv[it.key] || 0;
      const afford = bal >= it.price;
      return `
        <div class="shop-item">
          <span class="si-emoji">${it.emoji}</span>
          <span class="si-mid">
            <span class="si-name">${it.name}${owned ? ` <b class="si-owned">보유 ${owned}</b>` : ""}</span>
            <span class="si-desc">${it.desc}</span>
          </span>
          <button class="si-buy${afford ? "" : " no"}" data-key="${it.key}" ${afford ? "" : "disabled"}>
            ${it.price.toLocaleString()} GP
          </button>
        </div>`;
    }).join("");

    list.querySelectorAll(".si-buy:not(.no)").forEach(b => {
      b.addEventListener("click", async () => {
        b.disabled = true; b.textContent = "구매 중…";
        const r = await window.GALLA_buyItem(b.dataset.key);
        if (!r?.ok) {
          alert(r?.reason === "insufficient" ? "GP가 부족해요." : "구매에 실패했어요.");
        } else {
          window.BattleFX?.haptic?.("tap");
        }
        await refresh();
        document.dispatchEvent(new CustomEvent("galla:items-changed"));
      });
    });
  }

  window.openShop = async function () {
    build();
    await refresh();
    requestAnimationFrame(() => sheet.classList.add("open"));
  };
})();
