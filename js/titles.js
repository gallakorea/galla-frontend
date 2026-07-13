/* =========================================================
   🎨 꾸미기 — 칭호(획득제) + 닉네임 스타일(구매)
   - 칭호는 오직 획득: 갈라리안 등급 도달 · 시즌 랭킹 · 업적 (구매 불가 → 희소성)
   - 닉네임 스타일은 순수 꾸밈이라 구매 가능
   ========================================================= */
(function () {
  const sb = () => window.supabaseClient || window.supabase;
  const STYLES = [
    { k: "none", n: "기본", p: 0 }, { k: "gold", n: "✨ 골드", p: 1500 }, { k: "ice", n: "❄️ 아이스", p: 2500 },
    { k: "neon", n: "💠 네온", p: 2500 }, { k: "toxic", n: "☢️ 톡식", p: 3000 }, { k: "fire", n: "🔥 파이어", p: 3500 },
    { k: "royal", n: "👑 로열", p: 8000 }, { k: "rainbow", n: "🌈 레인보우", p: 12000 },
  ];

  function css() {
    if (document.getElementById("titles-css")) return;
    const s = document.createElement("style"); s.id = "titles-css";
    s.textContent = `
      .tt-sheet{position:fixed;inset:0;z-index:99997;display:flex;align-items:flex-end;justify-content:center}
      .tt-sheet .dim{position:absolute;inset:0;background:rgba(0,0,0,.55)}
      .tt-card{position:relative;width:100%;max-width:480px;max-height:82vh;overflow:auto;background:#14151a;
        border-radius:20px 20px 0 0;padding:16px 14px max(14px,env(safe-area-inset-bottom));animation:ttUp .24s ease}
      @keyframes ttUp{from{transform:translateY(100%)}}
      .tt-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
      .tt-title{font-weight:900;font-size:17px;color:#f5f5f2}
      .tt-bal{font-weight:900;color:#c9d1e0;font-size:14px}
      .tt-tabs{display:flex;gap:6px;margin-bottom:10px}
      .tt-tab{flex:1;border:none;background:rgba(255,255,255,.05);color:#c9d1e0;font-weight:800;font-size:13px;padding:9px 0;border-radius:10px;cursor:pointer}
      .tt-tab.on{background:linear-gradient(135deg,#3d6bff,#5b8cff);color:#fff}
      .tt-note{color:#8a8f9a;font-size:12px;margin:-2px 0 12px;line-height:1.5}
      .tt-sub{font-size:11px;font-weight:900;color:#8b8b93;margin:10px 2px 6px;letter-spacing:.5px}
      .tt-grid{display:flex;flex-direction:column;gap:8px}
      .tt-item{display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#16171c,#101116);
        border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:12px 14px}
      .tt-item.eq{border-color:rgba(201,209,224,.5);box-shadow:0 0 14px rgba(201,209,224,.15)}
      .tt-item.locked{opacity:.55}
      .tt-name{flex:1;font-weight:800;color:#f0f0f2;font-size:15px}
      .tt-btn{flex:0 0 auto;border:none;border-radius:10px;padding:9px 14px;font-weight:900;font-size:13px;cursor:pointer}
      .tt-btn.buy{background:linear-gradient(135deg,#3d6bff,#5b8cff);color:#fff}
      .tt-btn.buy.no{background:#2a2d36;color:#6c7280}
      .tt-btn.equip{background:rgba(201,209,224,.16);color:#c9d1e0;border:1px solid rgba(201,209,224,.4)}
      .tt-btn.on{background:linear-gradient(135deg,#c9d1e0,#8b93a3);color:#0a0a0b}
      .tt-lock{flex:0 0 auto;font-size:11px;font-weight:800;color:#8b8b93}
      .tt-close{width:100%;margin-top:12px;padding:13px;border:none;border-radius:12px;background:rgba(255,255,255,.06);color:#c9d1e0;font-weight:800;cursor:pointer}
    `;
    document.head.appendChild(s);
  }

  let sheet, tab = "title", bal = 0, ME = null;
  let gi = 0, tiers = [], awards = [], equipT = null, ownedS = new Set(), equipS = null;

  async function refresh() {
    const [balR, et, ms, sess] = await Promise.all([
      sb().rpc("ensure_balance"), sb().rpc("my_earned_titles"), sb().rpc("my_nickstyles"), sb().auth.getSession(),
    ]);
    bal = Math.round(balR.data || 0);
    gi = et.data?.gi || 0; tiers = et.data?.tiers || []; awards = et.data?.awards || []; equipT = et.data?.equipped || null;
    ownedS = new Set(ms.data?.owned || []); equipS = ms.data?.equipped || null;
    ME = sess.data?.session?.user?.id || null;
    render();
  }

  const eqBtn = (isEq) => isEq ? `<button class="tt-btn on" disabled>장착 중</button>` : "";
  function tierRow(t) {
    const isEq = t.name === equipT;
    const label = `<span class="nick-title" style="font-size:13px">${t.name}</span>`;
    let right;
    if (isEq) right = `<button class="tt-btn on" disabled>장착 중</button>`;
    else if (t.unlocked) right = `<button class="tt-btn equip" data-tier="${t.key}">장착</button>`;
    else right = `<span class="tt-lock">🔒 ${t.min.toLocaleString()} GI 필요</span>`;
    return `<div class="tt-item${isEq ? " eq" : ""}${t.unlocked ? "" : " locked"}"><span class="tt-name">${label}</span>${right}</div>`;
  }
  function awardRow(a) {
    const isEq = a.name === equipT;
    const label = `<span class="nick-title" style="font-size:13px">${a.name}</span>`;
    const right = isEq ? `<button class="tt-btn on" disabled>장착 중</button>` : `<button class="tt-btn equip" data-award="${a.key}">장착</button>`;
    return `<div class="tt-item${isEq ? " eq" : ""}"><span class="tt-name">🏆 ${label}</span>${right}</div>`;
  }
  function styleRow(t) {
    const isEq = (t.k === "none" && !equipS) || (t.k === equipS);
    const own = t.p === 0 || ownedS.has(t.k);
    const cls = t.k === "none" ? "" : (t.k === "gold" ? "nick-gold" : "ns-" + t.k);
    const label = `<span class="tt-name ${cls}" style="flex:0 0 auto;font-size:16px">${t.n}</span>`;
    let btn;
    if (isEq) btn = `<button class="tt-btn on" disabled>장착 중</button>`;
    else if (own) btn = `<button class="tt-btn equip" data-style="${t.k}">장착</button>`;
    else btn = `<button class="tt-btn buy${bal >= t.p ? "" : " no"}" data-buystyle="${t.k}" ${bal >= t.p ? "" : "disabled"}>${t.p.toLocaleString()} GP</button>`;
    return `<div class="tt-item${isEq ? " eq" : ""}"><span class="tt-name">${label}</span>${btn}</div>`;
  }

  function render() {
    sheet.querySelector("#tt-bal").textContent = bal.toLocaleString() + " GP";
    sheet.querySelectorAll(".tt-tab").forEach(t => t.classList.toggle("on", t.dataset.tab === tab));
    const note = sheet.querySelector("#tt-note");
    const grid = sheet.querySelector("#tt-grid");
    if (tab === "title") {
      note.innerHTML = `칭호는 <b style="color:#c9d1e0">활동·등급·시즌으로만 획득</b>돼요 (구매 불가) · 내 갈라 지수 <b>${gi.toLocaleString()} GI</b>`;
      grid.innerHTML =
        `<div class="tt-sub">🏅 등급 칭호</div>` + tiers.map(tierRow).join("") +
        (awards.length ? `<div class="tt-sub">🏆 시즌·업적 칭호</div>` + awards.map(awardRow).join("") : "") +
        `<div class="tt-item" style="opacity:.6"><span class="tt-name none"><span style="color:#8a8f9a;font-weight:700">칭호 없음</span></span>${equipT ? `<button class="tt-btn equip" data-tier="none">해제</button>` : `<button class="tt-btn on" disabled>기본</button>`}</div>`;
    } else {
      note.innerHTML = `닉네임 색/이펙트 — 순수 꾸밈이라 구매할 수 있어요`;
      grid.innerHTML = STYLES.map(styleRow).join("");
    }
    wire(grid);
  }

  function wire(grid) {
    grid.querySelectorAll("[data-tier]").forEach(b => b.onclick = () => doEquip("equip_tier_title", b.dataset.tier, "title"));
    grid.querySelectorAll("[data-award]").forEach(b => b.onclick = () => doEquip("equip_title", b.dataset.award, "title"));
    grid.querySelectorAll("[data-style]").forEach(b => b.onclick = () => doEquip("equip_nickstyle", b.dataset.style, "style"));
    grid.querySelectorAll("[data-buystyle]").forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = "구매 중…";
      const { data } = await sb().rpc("buy_nickstyle", { p_key: b.dataset.buystyle });
      if (!data?.ok) alert(data?.reason === "insufficient" ? "GP가 부족해요." : "구매 실패");
      else window.BattleFX?.haptic?.("tap");
      await refresh();
    });
  }
  async function doEquip(fn, key, kind) {
    const { data } = await sb().rpc(fn, { p_key: key });
    if (!data?.ok) { alert(data?.reason === "locked" ? `아직 잠김 — ${data.need?.toLocaleString()} GI 필요 (현재 ${data.gi?.toLocaleString()})` : "장착 실패"); return; }
    window.BattleFX?.haptic?.("tap");
    if (ME && window.GALLA_decoCache) {
      const cur = window.GALLA_decoCache[ME] || {};
      if (kind === "title") cur.title = data.title; else cur.nick_style = data.style;
      window.GALLA_decoCache[ME] = cur;
    }
    document.dispatchEvent(new CustomEvent("galla:items-changed"));
    await refresh();
  }

  window.GALLA_openTitles = async function () {
    const { data: s } = await sb().auth.getSession();
    if (!s?.session) { location.href = "login.html"; return; }
    css();
    document.getElementById("tt-sheet")?.remove();
    sheet = document.createElement("div"); sheet.id = "tt-sheet"; sheet.className = "tt-sheet";
    sheet.innerHTML = `<div class="dim"></div><div class="tt-card">
      <div class="tt-head"><span class="tt-title">🎨 꾸미기</span><span class="tt-bal" id="tt-bal">– GP</span></div>
      <div class="tt-tabs">
        <button class="tt-tab on" data-tab="title">🏷️ 칭호</button>
        <button class="tt-tab" data-tab="style">🎨 닉네임 스타일</button>
      </div>
      <div class="tt-note" id="tt-note"></div>
      <div class="tt-grid" id="tt-grid"></div>
      <button class="tt-close">닫기</button></div>`;
    document.body.appendChild(sheet);
    sheet.querySelector(".dim").onclick = () => sheet.remove();
    sheet.querySelector(".tt-close").onclick = () => sheet.remove();
    sheet.querySelectorAll(".tt-tab").forEach(t => t.onclick = () => { tab = t.dataset.tab; render(); });
    await refresh();
  };
})();
