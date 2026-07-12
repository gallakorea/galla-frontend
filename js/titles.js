/* =========================================================
   🎨 꾸미기 — 칭호(Titles) + 닉네임 스타일(Nick styles)
   GP 소비 + 상태 표현. 명예/지갑 분리(써도 순위·등급 유지). 자체 CSS
   window.GALLA_openTitles() (설정 타일에서 진입)
   ========================================================= */
(function () {
  const sb = () => window.supabaseClient || window.supabase;
  const TITLES = [
    { k: "none", n: "칭호 없음", p: 0 }, { k: "newbie", n: "🌱 눈팅 뉴비", p: 0 },
    { k: "breaker", n: "🔥 발끈러", p: 500 }, { k: "warrior", n: "⌨️ 키보드 워리어", p: 1500 },
    { k: "sniper", n: "🎯 여론 저격수", p: 3000 }, { k: "factbomb", n: "🧠 팩트 폭격기", p: 3000 },
    { k: "spy", n: "🕵️ 여론 스파이", p: 5000 }, { k: "agitator", n: "🌪️ 선동가", p: 8000 },
    { k: "king", n: "👑 논쟁의 왕", p: 15000 }, { k: "legend", n: "🏆 갈라 레전드", p: 30000 },
  ];
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
      .tt-bal{font-weight:900;color:#f5cf6b;font-size:14px}
      .tt-tabs{display:flex;gap:6px;margin-bottom:10px}
      .tt-tab{flex:1;border:none;background:rgba(255,255,255,.05);color:#c9d1e0;font-weight:800;font-size:13px;padding:9px 0;border-radius:10px;cursor:pointer}
      .tt-tab.on{background:linear-gradient(135deg,#3d6bff,#5b8cff);color:#fff}
      .tt-note{color:#8a8f9a;font-size:12px;margin:-2px 0 12px}
      .tt-grid{display:flex;flex-direction:column;gap:8px}
      .tt-item{display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#16171c,#101116);
        border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:12px 14px}
      .tt-item.eq{border-color:rgba(245,207,107,.5);box-shadow:0 0 14px rgba(245,207,107,.15)}
      .tt-name{flex:1;font-weight:800;color:#f0f0f2;font-size:15px}
      .tt-btn{flex:0 0 auto;border:none;border-radius:10px;padding:9px 14px;font-weight:900;font-size:13px;cursor:pointer}
      .tt-btn.buy{background:linear-gradient(135deg,#3d6bff,#5b8cff);color:#fff}
      .tt-btn.buy.no{background:#2a2d36;color:#6c7280}
      .tt-btn.equip{background:rgba(245,207,107,.16);color:#f5cf6b;border:1px solid rgba(245,207,107,.4)}
      .tt-btn.on{background:linear-gradient(135deg,#f5cf6b,#e0a93a);color:#0a0a0b}
      .tt-close{width:100%;margin-top:12px;padding:13px;border:none;border-radius:12px;background:rgba(255,255,255,.06);color:#c9d1e0;font-weight:800;cursor:pointer}
    `;
    document.head.appendChild(s);
  }

  let sheet, tab = "title", bal = 0;
  let ownedT = new Set(), equipT = null, ownedS = new Set(), equipS = null, ME = null;

  async function refresh() {
    const [balR, mt, ms, sess] = await Promise.all([
      sb().rpc("ensure_balance"), sb().rpc("my_titles"), sb().rpc("my_nickstyles"), sb().auth.getSession(),
    ]);
    bal = Math.round(balR.data || 0);
    ownedT = new Set(mt.data?.owned || []); equipT = mt.data?.equipped || null;
    ownedS = new Set(ms.data?.owned || []); equipS = ms.data?.equipped || null;
    ME = sess.data?.session?.user?.id || null;
    render();
  }

  function render() {
    sheet.querySelector("#tt-bal").textContent = bal.toLocaleString() + " GP";
    sheet.querySelectorAll(".tt-tab").forEach(t => t.classList.toggle("on", t.dataset.tab === tab));
    const grid = sheet.querySelector("#tt-grid");
    if (tab === "title") grid.innerHTML = TITLES.map(titleRow).join("");
    else grid.innerHTML = STYLES.map(styleRow).join("");
    wire(grid);
  }
  function titleRow(t) {
    const isEq = (t.k === "none" && !equipT) || (t.n === equipT);
    const own = t.p === 0 || ownedT.has(t.k);
    const label = t.k === "none" ? "칭호 없음" : `<span class="nick-title" style="font-size:13px">${t.n}</span>`;
    return itemHtml(t, isEq, own, label);
  }
  function styleRow(t) {
    const isEq = (t.k === "none" && !equipS) || (t.k === equipS);
    const own = t.p === 0 || ownedS.has(t.k);
    const cls = t.k === "none" || t.k === "gold" ? (t.k === "gold" ? "nick-gold" : "") : "ns-" + t.k;
    const label = `<span class="tt-name ${cls}" style="flex:0 0 auto;font-size:16px">${t.n}</span>`;
    return itemHtml(t, isEq, own, label);
  }
  function itemHtml(t, isEq, own, label) {
    let btn;
    if (isEq) btn = `<button class="tt-btn on" disabled>장착 중</button>`;
    else if (own) btn = `<button class="tt-btn equip" data-eq="${t.k}">장착</button>`;
    else btn = `<button class="tt-btn buy${bal >= t.p ? "" : " no"}" data-buy="${t.k}" ${bal >= t.p ? "" : "disabled"}>${t.p.toLocaleString()} GP</button>`;
    return `<div class="tt-item${isEq ? " eq" : ""}"><span class="tt-name">${label}</span>${btn}</div>`;
  }

  function wire(grid) {
    const buyFn = tab === "title" ? "buy_title" : "buy_nickstyle";
    const eqFn = tab === "title" ? "equip_title" : "equip_nickstyle";
    grid.querySelectorAll("[data-buy]").forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = "구매 중…";
      const { data } = await sb().rpc(buyFn, { p_key: b.dataset.buy });
      if (!data?.ok) alert(data?.reason === "insufficient" ? "GP가 부족해요." : "구매 실패");
      else window.BattleFX?.haptic?.("tap");
      await refresh();
    });
    grid.querySelectorAll("[data-eq]").forEach(b => b.onclick = async () => {
      const { data } = await sb().rpc(eqFn, { p_key: b.dataset.eq });
      if (!data?.ok) { alert("장착 실패"); return; }
      window.BattleFX?.haptic?.("tap");
      if (ME && window.GALLA_decoCache) {
        const cur = window.GALLA_decoCache[ME] || {};
        if (tab === "title") cur.title = data.title; else cur.nick_style = data.style;
        window.GALLA_decoCache[ME] = cur;
      }
      document.dispatchEvent(new CustomEvent("galla:items-changed"));
      await refresh();
    });
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
      <div class="tt-note">닉네임 옆·색에 반영돼요 · 사도 랭킹·등급은 안 떨어집니다(누적 획득 기준)</div>
      <div class="tt-grid" id="tt-grid"></div>
      <button class="tt-close">닫기</button></div>`;
    document.body.appendChild(sheet);
    sheet.querySelector(".dim").onclick = () => sheet.remove();
    sheet.querySelector(".tt-close").onclick = () => sheet.remove();
    sheet.querySelectorAll(".tt-tab").forEach(t => t.onclick = () => { tab = t.dataset.tab; render(); });
    await refresh();
  };
})();
