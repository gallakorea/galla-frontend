/* =========================================================
   GP 아이템 상점 + 인벤토리
   - 카탈로그는 서버(_item_price)와 동일하게 유지
   - window.openShop() / GALLA_myItems() / GALLA_buyItem(key)
   ========================================================= */
(function () {
  // group: 전투 / 꾸미기 / 도전 · kind: consumable(수량) | unlock(영구 해금)
  const CATALOG = [
    // ── 전투 ──
    { key: "cooldown_reset",  emoji: "⚡", name: "쿨다운 리셋권", price: 300, group: "battle", kind: "consumable",
      desc: "60초 쿨다운을 무시하고 즉시 다시 공격·방어·지원" },
    { key: "infiltrate_pass", emoji: "🕵️", name: "침투권", price: 500, group: "battle", kind: "consumable",
      desc: "오늘의 적진 침투 한도 +1 (기본 3회)" },
    { key: "reply_pass",      emoji: "🗯️", name: "대댓글 연장권", price: 300, group: "battle", kind: "consumable",
      desc: "오늘의 대댓글 한도 +15 (기본 40회)" },
    { key: "revive",          emoji: "✨", name: "부활권", price: 800, group: "battle", kind: "consumable",
      desc: "격파당한 내 댓글을 HP 50으로 부활" },
    // ── 꾸미기 ──
    { key: "emoticon_pack",   emoji: "😎", name: "이모티콘 사용권", price: 1000, group: "deco", kind: "unlock",
      desc: "댓글·전투에 갈라 이모티콘을 붙일 수 있어요 (영구)" },
    { key: "nick_deco",       emoji: "🎨", name: "닉네임 꾸미기", price: 1500, group: "deco", kind: "unlock",
      desc: "닉네임에 골드 반짝임 효과를 입혀요 (영구)" },
    // ── 도전 ──
    { key: "duel_ticket",     emoji: "⚔️", name: "일기토 신청서", price: 700, group: "duel", kind: "consumable",
      desc: "원하는 상대에게 1:1 논쟁 대결(일기토)을 신청" },
  ];
  const GROUPS = [
    { key: "battle", label: "⚔️ 전투" },
    { key: "deco",   label: "🎨 꾸미기" },
    { key: "duel",   label: "🏟️ 도전" },
  ];
  window.GALLA_ITEM_CATALOG = CATALOG;
  window.GALLA_hasItem = async function (key) {
    const inv = await window.GALLA_myItems();
    return (inv[key] || 0) > 0;
  };

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

    const itemHtml = (it) => {
      const owned = inv[it.key] || 0;
      const isUnlock = it.kind === "unlock";
      const ownedUnlock = isUnlock && owned > 0;
      const afford = bal >= it.price;
      const ownedBadge = owned
        ? ` <b class="si-owned">${isUnlock ? "보유 중" : "보유 " + owned}</b>` : "";
      let btn;
      if (ownedUnlock) {
        btn = `<button class="si-buy owned" disabled>보유 중</button>`;
      } else {
        btn = `<button class="si-buy${afford ? "" : " no"}" data-key="${it.key}" ${afford ? "" : "disabled"}>${it.price.toLocaleString()} GP</button>`;
      }
      return `
        <div class="shop-item">
          <span class="si-emoji">${it.emoji}</span>
          <span class="si-mid">
            <span class="si-name">${it.name}${ownedBadge}</span>
            <span class="si-desc">${it.desc}</span>
          </span>
          ${btn}
        </div>`;
    };
    const list = sheet.querySelector("#shopList");
    list.innerHTML = GROUPS.map(g => {
      const items = CATALOG.filter(it => it.group === g.key);
      if (!items.length) return "";
      return `<div class="shop-group-label">${g.label}</div>` + items.map(itemHtml).join("");
    }).join("");

    list.querySelectorAll(".si-buy:not(.no):not(.owned)").forEach(b => {
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
