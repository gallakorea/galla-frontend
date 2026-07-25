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
      desc: "60초 쿨다운을 무시하고 즉시 다시 공격·방어·지원", use: "이슈 전투에서 쿨다운 중에 공격·방어·지원을 누르면 사용을 물어봐요" },
    { key: "infiltrate_pass", emoji: "🕵️", name: "침투권", price: 500, group: "battle", kind: "consumable",
      desc: "오늘의 적진 침투 한도 +1 (기본 3회)", use: "적진 침투 한도(하루 3회) 소진 시 자동으로 제안돼요" },
    { key: "reply_pass",      emoji: "🗯️", name: "대댓글 연장권", price: 300, group: "battle", kind: "consumable",
      desc: "오늘의 대댓글 한도 +15 (기본 40회)", use: "대댓글 한도(하루 40회) 소진 시 자동으로 제안돼요" },
    { key: "shield",          emoji: "🛡", name: "보호막", price: 400, group: "battle", kind: "consumable",
      desc: "우리 진영 댓글에 10분간 보호막. 받는 피해가 절반(14→7)으로 줄어듭니다. 상대의 ⚡파쇄엔 뚫립니다.", use: "이슈 댓글의 🛡 버튼 — 같은 진영 댓글에 걸어요" },
    { key: "breaker",         emoji: "⚡", name: "파쇄", price: 500, group: "battle", kind: "consumable",
      desc: "상대의 🛡보호막을 부수고 정상 피해로 공격합니다. 보호막이 없으면 소모되지 않습니다.", use: "보호막 낀 상대를 공격하는 순간 자동으로 제안돼요" },
    { key: "revive",          emoji: "✨", name: "부활권", price: 800, group: "battle", kind: "consumable",
      desc: "격파당한 내 댓글을 HP 50으로 부활", use: "격파당한 내 댓글에 뜨는 ✨부활 버튼으로 써요" },
    // ── 꾸미기 ──
    { key: "emoticon_pack",   emoji: "😎", name: "이모티콘 사용권", price: 1000, group: "deco", kind: "unlock",
      desc: "댓글·전투에 갈라 이모티콘을 붙일 수 있어요 (영구)", use: "댓글 입력창의 😀 피커가 열려요" },
    { key: "nick_deco",       emoji: "🎨", name: "닉네임 꾸미기", price: 1500, group: "deco", kind: "unlock",
      desc: "닉네임에 골드 반짝임 효과를 입혀요 (영구) · 스타일 팩은 설정>꾸미기", use: "구매 즉시 내 닉네임에 골드 효과가 적용돼요" },
    { key: "sticker_pack_2",  emoji: "🔥", name: "감정폭발 스티커팩", price: 1000, group: "deco", kind: "unlock",
      desc: "킹받네·현타·극혐 등 감정 스티커 9종 (영구)", use: "댓글 😀 피커에 스티커 탭이 추가돼요" },
    { key: "sticker_pack_3",  emoji: "💢", name: "정시밈 스티커팩", price: 1000, group: "deco", kind: "unlock",
      desc: "내로남불·유체이탈·국뽕 등 시사 밈 9종 (영구)", use: "댓글 😀 피커에 스티커 탭이 추가돼요" },
    { key: "gif_pack",        emoji: "🎬", name: "GIF 사용권", price: 1500, group: "deco", kind: "unlock",
      desc: "댓글·전투에 움짤(GIF)을 검색해서 붙일 수 있어요 (영구)", use: "댓글 입력창의 GIF 버튼이 열려요" },
    { key: "walkie_pass",     emoji: "📻", name: "무전기 사용권", price: 1200, group: "deco", kind: "unlock",
      desc: "난장(오픈챗)에서 꾹 눌러 말하는 음성 메시지를 쓸 수 있어요 (영구 · 1:1은 무료)", use: "난장 채팅바의 🎤 버튼이 열려요" },
    // ── 도전 ──
    { key: "duel_ticket",     emoji: "⚔️", name: "일기토 신청서", price: 700, group: "duel", kind: "consumable",
      desc: "원하는 상대에게 1:1 논쟁 대결(일기토)을 신청", use: "상대 댓글 ⋯ 메뉴·프로필의 ⚔️ 일기토 신청 시 1장 쓰여요" },
    { key: "duel_extend_pass", emoji: "⏱️", name: "시간 연장권", price: 400, group: "duel", kind: "consumable",
      desc: "라이브 일기토 도중 제한시간을 60초 연장 (판당 1회)", use: "옥타곤 하단 ⏱️ 버튼으로 1장 쓰여요" },
    { key: "duel_finisher_pass", emoji: "🎤", name: "결정타", price: 300, group: "duel", kind: "consumable",
      desc: "회심의 한마디를 크게 강조! 관중석에 '결정타' 배너가 떠요 (판당 1회)", use: "옥타곤 입력창의 🎤 결정타를 켜고 발화하면 1장 쓰여요" },
    { key: "duel_rematch_pass", emoji: "🔁", name: "설욕전권", price: 500, group: "duel", kind: "consumable",
      desc: "패배한 일기토를 같은 상대·주제로 신청서 없이 즉시 재도전", use: "결과 화면의 🔁 설욕전 버튼으로 1장 쓰여요" },
    { key: "duel_cheer_boost", emoji: "📢", name: "응원 부스트", price: 300, group: "duel", kind: "consumable",
      desc: "관중 응원 베팅의 배당 지분을 1.7배로! 이긴 편일 때 몫이 커져요", use: "옥타곤 응원 시 📢 부스트를 켜면 1장 쓰여요" },
    { key: "duel_roar_pass", emoji: "🦁", name: "사자후", price: 2000, group: "duel", kind: "consumable",
      desc: "3초 음성으로 상대를 압도! 목소리 그대로 옥타곤에 울려퍼지는 최강 한 방 (판당 1회)", use: "옥타곤 아이템의 🦁 사자후로 3초 녹음해 발사, 1장 쓰여요" },
    // ── 유령 (기간제) ── kind:'ghost' → buy_ghost_pass(days)
    { key: "ghost_3",  emoji: "👻", name: "유령권 3일",  price: 800,  group: "ghost", kind: "ghost", days: 3,
      desc: "3일간 댓글을 정체불명 유령으로! (그때 단 댓글은 영구 익명)", use: "이슈·광장 댓글의 👻 토글로 유령 댓글을 써요" },
    { key: "ghost_7",  emoji: "👻", name: "유령권 7일",  price: 1500, group: "ghost", kind: "ghost", days: 7,
      desc: "7일간 유령 활동 · 유저당 고정 페르소나", use: "이슈·광장 댓글의 👻 토글로 유령 댓글을 써요" },
    { key: "ghost_30", emoji: "👻", name: "유령권 30일", price: 4500, group: "ghost", kind: "ghost", days: 30,
      desc: "한 달간 유령! 최고 가성비", use: "이슈·광장 댓글의 👻 토글로 유령 댓글을 써요" },
  ];
  const GROUPS = [
    { key: "battle", label: "⚔️ 전투" },
    { key: "deco",   label: "🎨 꾸미기" },
    { key: "duel",   label: "🏟️ 도전" },
    { key: "ghost",  label: "👻 유령" },
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
          <span class="shop-head-right"><span class="shop-bal" id="shopBal">– GP</span><button class="shop-charge" id="shopCharge">＋ 충전</button></span>
        </div>
        <div class="shop-tabs">
          <button class="shop-tab on" data-t="buy" type="button">🛒 구매</button>
          <button class="shop-tab" data-t="inv" type="button">🎒 보유 <b id="shopInvCnt" hidden></b></button>
        </div>
        <div class="shop-list" id="shopList"></div>
        <div class="shop-list shop-inv off" id="shopInv"></div>
        <div class="shop-note">GP는 출석·데일리 미션·예측으로 모을 수 있어요<br><span style="opacity:.7;font-size:11px">※ GP는 서비스 내 재화이며 현금으로 환전·환급되지 않습니다.</span></div>
      </div>`;
    document.body.appendChild(sheet);
    sheet.querySelector(".shop-dim").addEventListener("click", () => sheet.classList.remove("open"));

    /* 위에서 아래로 끌어 닫기 — 딤 탭만으로는 닫는 법이 안 보인다(사장님 지적).
       리스트 스크롤과 안 싸우게 상단부(그립·헤더·탭)에서 시작한 드래그만 받는다. */
    const card = sheet.querySelector(".shop-card");

    /* 🖱 데스크톱(마우스): 상단부(그립·헤더·탭)에서 끌어 닫기 */
    let sy = null, dy = 0, dragging = false;
    card.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") return;   // 터치는 아래 전면 드래그가 담당
      if (e.target.closest(".shop-list, .shop-note, button, a, input")) return;
      sy = e.clientY; dy = 0; dragging = true;
      card.style.transition = "none";
      try { card.setPointerCapture(e.pointerId); } catch (_) {}
    });
    card.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      dy = Math.max(0, e.clientY - sy);
      card.style.transform = `translateY(${dy}px)`;
    });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      card.style.transition = "";
      card.style.transform = "";
      if (dy > 110) sheet.classList.remove("open");
      dy = 0;
    };
    card.addEventListener("pointerup", endDrag);
    card.addEventListener("pointercancel", endDrag);

    /* 📱 터치: 시트 어디서든(목록 포함) 아래로 끌면 내려온다 — 카톡 문법.
       목록에서 시작한 경우엔 '목록이 맨 위일 때 + 아래 방향'일 때만 시트를
       잡는다(스크롤과 충돌 없음). 위로 끌면 즉시 스크롤에 양보. */
    let tSy = null, tDy = 0, tDrag = false, tList = null;
    card.addEventListener("touchstart", (e) => {
      if (e.target.closest("button, a, input")) { tSy = null; return; }
      tList = e.target.closest(".shop-list");
      tSy = e.touches[0].clientY; tDy = 0; tDrag = false;
    }, { passive: true });
    card.addEventListener("touchmove", (e) => {
      if (tSy == null) return;
      const dy2 = e.touches[0].clientY - tSy;
      if (!tDrag) {
        if (dy2 < -4) { tSy = null; return; }                       // 위로 = 스크롤 의도
        if (dy2 > 8 && (!tList || tList.scrollTop <= 0)) {          // 아래로 + 목록 맨 위
          tDrag = true; card.style.transition = "none";
        } else return;
      }
      tDy = Math.max(0, dy2);
      card.style.transform = `translateY(${tDy}px)`;
      e.preventDefault();   // 시트를 잡았으면 배경·목록 스크롤은 정지
    }, { passive: false });
    const tEnd = () => {
      if (tSy == null) return;
      tSy = null;
      if (!tDrag) return;
      tDrag = false;
      card.style.transition = ""; card.style.transform = "";
      if (tDy > 110) sheet.classList.remove("open");
      tDy = 0;
    };
    card.addEventListener("touchend", tEnd);
    card.addEventListener("touchcancel", tEnd);
    sheet.querySelector("#shopCharge").addEventListener("click", () => window.GALLA_openCharge?.());
    /* hidden 속성은 .shop-list{display:flex}에 진다(명세: CSS display가 이김)
       — 실제로 두 리스트가 겹쳐 보이는 사고가 났다. 클래스로 확실히 끈다. */
    sheet.querySelectorAll(".shop-tab").forEach(t => t.addEventListener("click", () => {
      sheet.querySelectorAll(".shop-tab").forEach(x => x.classList.toggle("on", x === t));
      sheet.querySelector("#shopList").classList.toggle("off", t.dataset.t !== "buy");
      sheet.querySelector("#shopInv").classList.toggle("off", t.dataset.t !== "inv");
    }));
    return sheet;
  }

  async function refresh() {
    const [balR, inv, gh] = await Promise.all([
      sb().rpc("ensure_balance"),
      window.GALLA_myItems(),
      sb().rpc("ghost_status").then(r => r.data).catch(() => null),
    ]);
    const bal = Math.round(balR.data || 0);
    const balEl = sheet.querySelector("#shopBal");
    if (balEl) balEl.textContent = bal.toLocaleString() + " GP";
    // 유령권 남은 기간
    const ghostDays = (gh?.active && gh.until)
      ? Math.max(0, Math.ceil((new Date(gh.until) - Date.now()) / 86400000)) : 0;

    const itemHtml = (it) => {
      const owned = inv[it.key] || 0;
      const isUnlock = it.kind === "unlock";
      const isGhost = it.kind === "ghost";
      const ownedUnlock = isUnlock && owned > 0;
      const afford = bal >= it.price;
      const ownedBadge = owned
        ? ` <b class="si-owned">${isUnlock ? "보유 중" : "보유 " + owned}</b>`
        : (isGhost && ghostDays > 0 && it.days === Math.min(...CATALOG.filter(x => x.kind === "ghost").map(x => x.days))
            ? ` <b class="si-owned">유령 ${ghostDays}일 남음</b>` : "");
      let btn;
      if (ownedUnlock) {
        btn = `<button class="si-buy owned" disabled>보유 중</button>`;
      } else {
        btn = `<button class="si-buy${afford ? "" : " no"}" data-key="${it.key}" data-owned="${owned}" ${afford ? "" : "disabled"}>${it.price.toLocaleString()} GP</button>`;
      }
      return `
        <div class="shop-item${owned ? " has-owned" : ""}">
          <span class="si-emoji">${it.emoji}</span>
          <span class="si-mid">
            <span class="si-name">${it.name}${ownedBadge}</span>
            <span class="si-desc">${it.desc}</span>
            ${it.use ? `<span class="si-use">📍 ${it.use}</span>` : ""}
          </span>
          ${btn}
        </div>`;
    };
    /* 🎒 보유 탭 — 갖고 있는 것만 모아 수량·사용처를 크게 보여준다 */
    const invEl = sheet.querySelector("#shopInv");
    const ghostRow = ghostDays > 0
      ? [{ emoji: "👻", name: "유령권", sub: `${ghostDays}일 남음`, use: "이슈·광장 댓글의 👻 토글로 유령 댓글을 써요" }] : [];
    const invRows = ghostRow.concat(
      CATALOG.filter(it => it.kind !== "ghost" && (inv[it.key] || 0) > 0)
        .map(it => ({ emoji: it.emoji, name: it.name,
          sub: it.kind === "unlock" ? "영구 보유" : `${inv[it.key]}개`, use: it.use }))
    );
    const cnt = sheet.querySelector("#shopInvCnt");
    if (cnt) { cnt.textContent = invRows.length; cnt.hidden = !invRows.length; }
    invEl.innerHTML = invRows.length
      ? invRows.map(r => `
          <div class="shop-item has-owned">
            <span class="si-emoji">${r.emoji}</span>
            <span class="si-mid">
              <span class="si-name">${r.name} <b class="si-owned">${r.sub}</b></span>
              ${r.use ? `<span class="si-use">📍 ${r.use}</span>` : ""}
            </span>
          </div>`).join("")
      : `<div class="shop-inv-empty">🎒 아직 보유한 아이템이 없어요.<br><small>구매 탭에서 전투·꾸미기 아이템을 만나보세요.</small></div>`;

    const list = sheet.querySelector("#shopList");
    list.innerHTML = GROUPS.map(g => {
      const items = CATALOG.filter(it => it.group === g.key);
      if (!items.length) return "";
      return `<div class="shop-group-label">${g.label}</div>` + items.map(itemHtml).join("");
    }).join("");

    list.querySelectorAll(".si-buy:not(.no):not(.owned)").forEach(b => {
      b.addEventListener("click", async () => {
        const it = CATALOG.find(x => x.key === b.dataset.key);
        /* 이미 갖고 있는 소모품 — 보유를 못 보고 또 사는 사고가 실제로 났다(일기토 4연속) */
        const ownedNow = Number(b.dataset.owned || 0);
        if (it?.kind === "consumable" && ownedNow > 0 &&
            !confirm(`이미 ${it.name} ${ownedNow}개를 갖고 있어요.\n1개 더 구매할까요?`)) return;
        b.disabled = true; b.textContent = "구매 중…";
        // 👻 유령권은 기간제 → buy_ghost_pass(days)
        const r = it?.kind === "ghost"
          ? (await sb().rpc("buy_ghost_pass", { p_days: it.days })).data
          : await window.GALLA_buyItem(b.dataset.key);
        if (r?.ok && it?.kind === "ghost") window.BattleFX?.banner?.(`👻 유령권 ${it.days}일 활성화!`, "cheer");
        if (!r?.ok) {
          if (r?.reason === "insufficient" && window.GALLA_needGP) {
            const need = (r.cost || 0) - (r.balance || 0);
            window.GALLA_needGP(need > 0 ? need : (r.cost || 0), "아이템 구매에 GP가 부족해요");
          } else {
            alert(r?.reason === "insufficient" ? "GP가 부족해요." : "구매에 실패했어요.");
          }
        } else {
          window.BattleFX?.haptic?.("tap");
          /* 성공이 '보이게' — 피드백이 진동뿐이라 성공한 줄 모르고
             연타 재구매하는 사고가 실제로 났다(일기토 신청서 4연속 결제) */
          if (it?.kind !== "ghost") shopToast(`✅ ${it?.name || "아이템"} 구매 완료${it?.kind === "consumable" && r.qty ? ` · 보유 ${r.qty}개` : ""}`);
        }
        await refresh();
        document.dispatchEvent(new CustomEvent("galla:items-changed"));
      });
    });
  }

  let toastT = null;
  function shopToast(msg) {
    if (!sheet) return;
    let t = sheet.querySelector(".shop-toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "shop-toast";
      t.style.cssText = "position:absolute;left:50%;top:54px;transform:translateX(-50%);z-index:5;" +
        "background:#173a22;border:1px solid #2fd07a55;color:#8ff0b4;font-size:13px;font-weight:800;" +
        "padding:9px 16px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.45);white-space:nowrap;" +
        "opacity:0;transition:opacity .15s";
      sheet.querySelector(".shop-card")?.appendChild(t);
    }
    t.textContent = msg;
    requestAnimationFrame(() => { t.style.opacity = "1"; });
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.style.opacity = "0"; }, 2200);
  }

  window.openShop = async function () {
    build();
    await refresh();
    requestAnimationFrame(() => sheet.classList.add("open"));
  };
})();
