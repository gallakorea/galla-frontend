/* =========================================================
   😎 이모티콘 사용권(emoticon_pack) — 갈라 전용 스티커(짤)
   - 키보드로 못 넣는 논쟁·전투 밈 스티커(이미지). 보유자만 삽입 가능
   - 입력창에 [emo:key] 마커 삽입 → 렌더러가 <img>로 변환(모두에게 보임)
   - 자체 CSS 주입
   ========================================================= */
(function () {
  // key = 파일명(assets/emoticons/{key}.png), label = 접근성/툴팁
  const CATS = [
    { key: "battle", label: "⚔️ 논쟁", emo: ["fact", "logic", "rebut", "line", "urthink", "noconcede", "goso", "gukrul", "sonjeol"] },
    { key: "react", label: "🔥 리액션", emo: ["pro_yes", "con_no", "ojz", "nono", "kkk", "gg", "legend", "bakje", "jjin"] },
  ];
  const ALL = CATS.flatMap(c => c.emo);
  const KEYS = new Set(ALL);
  const SRC = (k) => `/assets/emoticons/${k}.png`;

  // 렌더러 공용: [emo:key] → <img> (issue.comments.js 등에서 사용)
  window.GALLA_EMO_KEYS = KEYS;
  window.GALLA_renderEmoticons = function (html) {
    if (!html || html.indexOf("[emo:") === -1) return html;
    return html.replace(/\[emo:([a-z_]+)\]/g, (m, k) =>
      KEYS.has(k) ? `<img class="galla-emo" src="${SRC(k)}" alt="스티커" loading="lazy">` : m);
  };

  let ownCache = null;
  async function owns() {
    if (ownCache !== null) return ownCache;
    try { ownCache = await window.GALLA_hasItem?.("emoticon_pack") || false; }
    catch (e) { ownCache = false; }
    return ownCache;
  }
  document.addEventListener("galla:items-changed", () => { ownCache = null; });

  function css() {
    if (document.getElementById("emo-css")) return;
    const s = document.createElement("style");
    s.id = "emo-css";
    s.textContent = `
      .emo-btn{flex:0 0 auto;border:none;background:transparent;font-size:19px;line-height:1;
        padding:6px;cursor:pointer;border-radius:10px;opacity:.9}
      .emo-btn:hover{background:rgba(255,255,255,.08)}
      .emo-panel{position:fixed;z-index:9999;width:min(360px,94vw);
        background:#16171c;border:1px solid rgba(255,255,255,.12);border-radius:16px;
        box-shadow:0 12px 40px rgba(0,0,0,.55);padding:10px;transform:translateY(6px);
        opacity:0;pointer-events:none;transition:opacity .14s,transform .14s}
      .emo-panel.open{opacity:1;pointer-events:auto;transform:translateY(0)}
      .emo-tabs{display:flex;gap:6px;margin-bottom:8px}
      .emo-tab{flex:1;border:none;background:rgba(255,255,255,.05);color:#c9d1e0;font-size:13px;font-weight:800;
        padding:7px 0;border-radius:10px;cursor:pointer}
      .emo-tab.on{background:linear-gradient(135deg,#3d6bff,#5b8cff);color:#fff}
      .emo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-height:230px;overflow:auto;padding:2px}
      .emo-cell{border:none;background:transparent;padding:0;cursor:pointer;border-radius:10px}
      .emo-cell img{width:100%;display:block;border-radius:9px}
      .emo-cell:active{transform:scale(.9)}
      .emo-lock{padding:16px 12px;text-align:center;color:#c9d1e0}
      .emo-lock b{color:#f5cf6b}
      .emo-lock button{margin-top:12px;width:100%;padding:11px;border:none;border-radius:12px;
        background:linear-gradient(135deg,#f5cf6b,#e0a93a);color:#0a0a0b;font-weight:900;cursor:pointer}
      .galla-emo{max-width:150px;width:46vw;height:auto;vertical-align:middle;margin:3px 0;border-radius:10px;display:inline-block}
    `;
    document.head.appendChild(s);
  }

  let panel = null, curInput = null, curCat = "battle";
  function buildPanel() {
    if (panel) return panel;
    panel = document.createElement("div");
    panel.className = "emo-panel";
    document.body.appendChild(panel);
    document.addEventListener("click", (e) => {
      if (panel.classList.contains("open") && !panel.contains(e.target) && !e.target.closest(".emo-btn")) closePanel();
    });
    window.addEventListener("resize", closePanel);
    window.addEventListener("scroll", closePanel, true);
    return panel;
  }

  function renderPanel(unlocked) {
    if (!unlocked) {
      panel.innerHTML = `<div class="emo-lock">
        <div style="font-size:30px">😎</div>
        <div style="margin-top:6px"><b>이모티콘 사용권</b>으로 갈라 전용 스티커를 붙이세요</div>
        <button type="button" id="emo-shop">🛒 상점에서 잠금 해제</button></div>`;
      panel.querySelector("#emo-shop").addEventListener("click", () => { closePanel(); window.openShop?.(); });
      return;
    }
    const tabs = CATS.map(c => `<button type="button" class="emo-tab${c.key === curCat ? " on" : ""}" data-cat="${c.key}">${c.label}</button>`).join("");
    const cat = CATS.find(c => c.key === curCat) || CATS[0];
    const grid = cat.emo.map(k => `<button type="button" class="emo-cell" data-emo="${k}"><img src="${SRC(k)}" alt="스티커" loading="lazy"></button>`).join("");
    panel.innerHTML = `<div class="emo-tabs">${tabs}</div><div class="emo-grid">${grid}</div>`;
    panel.querySelectorAll(".emo-tab").forEach(t => t.addEventListener("click", () => { curCat = t.dataset.cat; renderPanel(true); }));
    panel.querySelectorAll(".emo-cell").forEach(c => c.addEventListener("click", () => insert(c.dataset.emo)));
  }

  function insert(key) {
    const el = curInput;
    if (!el) return;
    const marker = `[emo:${key}]`;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + marker + el.value.slice(end);
    const pos = start + marker.length;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
    try { el.setSelectionRange(pos, pos); } catch (e) {}
    window.BattleFX?.haptic?.("tap");
    closePanel();
  }

  function positionPanel(btn) {
    const r = btn.getBoundingClientRect();
    buildPanel();
    const w = Math.min(360, window.innerWidth * 0.94);
    let left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    panel.style.width = w + "px";
    panel.style.left = left + "px";
    panel.style.top = "auto";
    panel.style.bottom = (window.innerHeight - r.top + 8) + "px";
  }
  function closePanel() { panel?.classList.remove("open"); }

  async function togglePanel(btn, input) {
    buildPanel();
    if (panel.classList.contains("open") && curInput === input) { closePanel(); return; }
    curInput = input;
    positionPanel(btn);
    renderPanel(await owns());
    requestAnimationFrame(() => panel.classList.add("open"));
  }

  function attach(row, input) {
    if (!row || !input || row.querySelector(":scope > .emo-btn")) return;
    css();
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "emo-btn"; btn.textContent = "😎";
    btn.setAttribute("aria-label", "스티커");
    // 입력창은 클릭 시점에 새로 조회(투표 후 재렌더로 참조가 낡는 문제 방지)
    btn.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const live = row.querySelector("input") || input;
      togglePanel(btn, live);
    });
    const submit = row.querySelector(".submit-btn, .ic-send, .gif-btn");
    if (submit) row.insertBefore(btn, submit); else row.appendChild(btn);
  }

  function scan() {
    css();
    attach(document.querySelector(".battle-input-top"), document.getElementById("battle-comment-input"));
    const ic = document.getElementById("inline-composer");
    if (ic) attach(ic.querySelector(".ic-row"), ic.querySelector("#ic-input"));
  }
  window.GALLA_emoticonScan = scan;
  function boot() {
    scan();
    try { new MutationObserver(() => scan()).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
