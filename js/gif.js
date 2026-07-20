/* =========================================================
   🎬 GIF 피커 — GIPHY 검색/트렌딩. gif_pack 보유자만 사용
   - gif-search 엣지 함수(GIPHY 프록시)로 검색, 키는 서버 보관
   - 입력창에 [gif:URL] 마커 → issue.comments.js 렌더러가 <img>로 변환
   - 미보유 시 잠금 + 상점 유도 (emoticon.js와 동일 톤)
   ========================================================= */
(function () {
  const ITEM = "gif_pack";
  const sb = () => window.supabaseClient;

  // 보유 캐시 (emoticon.js와 동일 규약)
  const ownCache = {};
  async function owns() {
    if (ITEM in ownCache) return ownCache[ITEM];
    try { ownCache[ITEM] = await window.GALLA_hasItem?.(ITEM) || false; }
    catch (e) { ownCache[ITEM] = false; }
    return ownCache[ITEM];
  }
  document.addEventListener("galla:items-changed", () => { delete ownCache[ITEM]; });

  async function search(q) {
    try {
      const { data, error } = await sb().functions.invoke("gif-search", { body: { q: q || "" } });
      if (error) return { results: [], err: "error" };
      if (data?.error === "no_key") return { results: [], err: "no_key" };
      return { results: data?.results || [] };
    } catch (e) { return { results: [], err: "error" }; }
  }

  function css() {
    if (document.getElementById("gif-css")) return;
    const s = document.createElement("style"); s.id = "gif-css";
    s.textContent = `
      .gifp-btn{flex:0 0 auto;border:none;background:rgba(255,255,255,.06);line-height:0;padding:6px 8px;cursor:pointer;border-radius:9px;opacity:.92;display:flex;align-items:center}
      .gifp-btn:hover{background:rgba(255,255,255,.12);opacity:1}
      .gifp-btn img{height:12px;display:block;pointer-events:none}
      .gif-powered img.gif-brand{height:12px;vertical-align:middle;margin-left:3px;opacity:.85}
      .gif-panel{position:fixed;z-index:9999;width:min(380px,94vw);background:#16171c;border:1px solid rgba(255,255,255,.12);
        border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.55);padding:10px;transform:translateY(6px);opacity:0;pointer-events:none;transition:opacity .14s,transform .14s}
      .gif-panel.open{opacity:1;pointer-events:auto;transform:translateY(0)}
      .gif-search{display:flex;gap:6px;margin-bottom:8px}
      .gif-search input{flex:1;background:#0c0d11;border:1px solid rgba(255,255,255,.14);border-radius:10px;color:#fff;padding:9px 12px;font-size:14px;font-family:inherit}
      .gif-search input:focus{outline:none;border-color:#5b8cff}
      .gif-grid{column-count:2;column-gap:8px;max-height:280px;overflow:auto;padding:2px}
      .gif-cell{width:100%;display:block;border-radius:9px;margin-bottom:8px;cursor:pointer;background:#0c0d11}
      .gif-cell:active{transform:scale(.97)}
      .gif-powered{text-align:right;font-size:10px;color:#6c7280;margin-top:6px;font-weight:700}
      .gif-msg{padding:22px 12px;text-align:center;color:#9aa0ad;font-size:13px;column-span:all;line-height:1.5}
      .gif-lock{padding:18px 12px;text-align:center;color:#c9d1e0}
      .gif-lock b{color:#c9d1e0}
      .gif-lock button{margin-top:12px;width:100%;padding:11px;border:none;border-radius:12px;background:linear-gradient(135deg,#c9d1e0,#8b93a3);color:#0a0a0b;font-weight:900;cursor:pointer}
    `;
    document.head.appendChild(s);
  }

  let panel = null, curInput = null, curBtn = null, seq = 0, tmr = null;
  function buildPanel() {
    if (panel) return panel;
    panel = document.createElement("div"); panel.className = "gif-panel";
    document.body.appendChild(panel);
    document.addEventListener("click", (e) => {
      if (panel.classList.contains("open") && !panel.contains(e.target) && !e.target.closest(".gifp-btn")) closePanel();
    });
    /* resize·scroll에 닫으면 안 된다 — 모바일에서 검색창을 탭하는 순간
       키보드가 뜨며 resize/scroll이 발생해 '쓰려고 하면 닫히는' 버그가 됐다.
       (GIF 목록 스크롤도 capture에 걸려 닫혔다) 닫는 대신 버튼 기준으로 재배치. */
    const reflow = () => {
      if (!panel.classList.contains("open")) return;
      if (!curBtn || !curBtn.isConnected) { closePanel(); return; }
      positionPanel(curBtn);
    };
    window.addEventListener("resize", reflow);
    window.visualViewport?.addEventListener("resize", reflow);
    window.addEventListener("scroll", (e) => { if (panel.contains(e.target)) return; reflow(); }, true);
    return panel;
  }

  function renderResults(results) {
    const grid = panel.querySelector(".gif-grid");
    if (!grid) return;
    if (!results.length) { grid.innerHTML = `<div class="gif-msg">결과가 없어요. 다른 검색어를 입력해 보세요.</div>`; return; }
    grid.innerHTML = results.map(g =>
      `<img class="gif-cell" loading="lazy" src="${(g.preview || g.url).replace(/"/g, "")}" data-url="${(g.url).replace(/"/g, "")}">`).join("");
    grid.querySelectorAll(".gif-cell").forEach(c => c.addEventListener("click", () => insert(c.dataset.url)));
  }

  async function runSearch(q) {
    const grid = panel.querySelector(".gif-grid");
    if (grid) grid.innerHTML = `<div class="gif-msg">불러오는 중…</div>`;
    const my = ++seq;
    const { results, err } = await search(q);
    if (my !== seq) return; // 최신 쿼리만 반영
    if (err === "no_key") {
      if (grid) grid.innerHTML = `<div class="gif-msg">GIF 서비스가 아직 설정되지 않았어요.<br>잠시 후 다시 시도해 주세요.</div>`;
      return;
    }
    renderResults(results);
  }

  async function renderPanel() {
    const has = await owns();
    if (!has) {
      panel.innerHTML = `<div class="gif-lock"><div style="font-size:28px">🔒</div>
        <div style="margin-top:6px"><b>🎬 GIF 사용권</b>을 잠금 해제하세요</div>
        <div style="font-size:12px;color:#8a8f9a;margin-top:4px">댓글·전투에 움짤(GIF)을 붙일 수 있어요</div>
        <button type="button" id="gif-buy">🛒 상점에서 구매 (1,500 GP)</button></div>`;
      panel.querySelector("#gif-buy")?.addEventListener("click", () => { closePanel(); window.openShop?.(); });
      return;
    }
    panel.innerHTML = `
      <div class="gif-search"><input type="text" id="gif-q" placeholder="GIF 검색 (예: 반박, ㅋㅋ, 팩트)" autocomplete="off"></div>
      <div class="gif-grid"></div>
      <div class="gif-powered">Powered by <img class="gif-brand" src="/assets/giphy-logo.svg" alt="GIPHY"></div>`;
    const q = panel.querySelector("#gif-q");
    q.addEventListener("input", () => { clearTimeout(tmr); tmr = setTimeout(() => runSearch(q.value.trim()), 350); });
    q.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); clearTimeout(tmr); runSearch(q.value.trim()); } });
    runSearch(""); // 트렌딩
  }

  function insert(url) {
    const el = curInput; if (!el || !url) return;
    const marker = ` [gif:${url}] `;
    const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + marker + el.value.slice(end);
    const pos = start + marker.length;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {}
    window.BattleFX?.haptic?.("tap");
    closePanel();
  }

  function positionPanel(btn) {
    const r = btn.getBoundingClientRect(); buildPanel();
    const w = Math.min(380, window.innerWidth * 0.94);
    panel.style.width = w + "px";
    panel.style.left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8) + "px";
    panel.style.top = "auto"; panel.style.bottom = (window.innerHeight - r.top + 8) + "px";
  }
  function closePanel() { panel?.classList.remove("open"); }
  async function togglePanel(btn, input) {
    buildPanel();
    if (panel.classList.contains("open") && curInput === input) { closePanel(); return; }
    curInput = input; curBtn = btn; positionPanel(btn);
    await renderPanel();
    requestAnimationFrame(() => panel.classList.add("open"));
  }

  function attach(row, input) {
    if (!row || !input || row.querySelector(":scope > .gifp-btn")) return;
    css();
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "gifp-btn";
    btn.innerHTML = `<img src="/assets/giphy-logo.svg" alt="GIF">`;
    btn.setAttribute("aria-label", "GIF");
    btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); togglePanel(btn, row.querySelector("input") || input); });
    const submit = row.querySelector(".submit-btn, .ic-send");
    if (submit) row.insertBefore(btn, submit); else row.appendChild(btn);
  }
  function scan() {
    css();
    attach(document.querySelector(".battle-input-top"), document.getElementById("battle-comment-input"));
    const ic = document.getElementById("inline-composer");
    if (ic) attach(ic.querySelector(".ic-row"), ic.querySelector("#ic-input"));
  }
  window.GALLA_gifScan = scan;
  function boot() {
    scan();
    try { new MutationObserver(() => scan()).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
