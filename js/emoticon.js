/* =========================================================
   😎 이모티콘 사용권(emoticon_pack) — 댓글·전투 입력창 이모티콘 피커
   - 보유자(GALLA_hasItem)에게만 실제 삽입 동작, 미보유자는 상점 유도
   - 컴포저 입력행에 😎 버튼 자동 부착 + 커서 위치에 삽입
   - 자체 CSS 주입 (페이지별 <link> 불필요)
   ========================================================= */
(function () {
  const CATS = [
    { key: "battle", label: "⚔️", emo: ["⚔️","🔥","💥","👊","✊","🥊","🛡️","💣","🎯","💯","🚩","🏴","👑","🏆","⚡","💢","🗯️","📢"] },
    { key: "face",   label: "😏", emo: ["😏","😤","🤬","😡","🙄","😮‍💨","🤔","🧐","😎","🥶","🤯","😱","🤡","💀","☠️","🙃","😈","🥲"] },
    { key: "react",  label: "👏", emo: ["👏","🙏","🤝","💦","👀","🧠","💡","✅","❌","⭕","🔨","🧨","🎤","📉","📈","🫡","🫢","🙌"] },
    { key: "galla",  label: "🌱", emo: ["🌱","🔥","⌨️","🎤","🌪️","👑","🗳️","⚖️","🎭","🦾","🫵","🤺","🏟️","📜","🕵️","🎖️","🥇","🔱"] },
  ];

  let ownCache = null; // null=미확인, true/false
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
      .emo-panel{position:fixed;z-index:9999;width:min(340px,92vw);
        background:#16171c;border:1px solid rgba(255,255,255,.12);border-radius:16px;
        box-shadow:0 12px 40px rgba(0,0,0,.55);padding:10px;transform:translateY(6px);
        opacity:0;pointer-events:none;transition:opacity .14s,transform .14s}
      .emo-panel.open{opacity:1;pointer-events:auto;transform:translateY(0)}
      .emo-tabs{display:flex;gap:4px;margin-bottom:8px}
      .emo-tab{flex:1;border:none;background:rgba(255,255,255,.05);color:#c9d1e0;font-size:16px;
        padding:6px 0;border-radius:10px;cursor:pointer}
      .emo-tab.on{background:linear-gradient(135deg,#3d6bff,#5b8cff);color:#fff}
      .emo-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:2px;max-height:180px;overflow:auto}
      .emo-cell{border:none;background:transparent;font-size:22px;padding:6px 0;cursor:pointer;border-radius:10px}
      .emo-cell:active{transform:scale(.86)}
      .emo-cell:hover{background:rgba(255,255,255,.08)}
      .emo-lock{padding:16px 12px;text-align:center;color:#c9d1e0}
      .emo-lock b{color:#f5cf6b}
      .emo-lock button{margin-top:12px;width:100%;padding:11px;border:none;border-radius:12px;
        background:linear-gradient(135deg,#f5cf6b,#e0a93a);color:#0a0a0b;font-weight:900;cursor:pointer}
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
      if (panel.classList.contains("open") && !panel.contains(e.target) && !e.target.closest(".emo-btn"))
        closePanel();
    });
    window.addEventListener("resize", closePanel);
    window.addEventListener("scroll", closePanel, true);
    return panel;
  }

  function renderPanel(unlocked) {
    if (!unlocked) {
      panel.innerHTML = `<div class="emo-lock">
        <div style="font-size:30px">😎</div>
        <div style="margin-top:6px"><b>이모티콘 사용권</b>이 있어야 붙일 수 있어요</div>
        <button type="button" id="emo-shop">🛒 상점에서 잠금 해제</button></div>`;
      panel.querySelector("#emo-shop").addEventListener("click", () => { closePanel(); window.openShop?.(); });
      return;
    }
    const tabs = CATS.map(c => `<button type="button" class="emo-tab${c.key===curCat?" on":""}" data-cat="${c.key}">${c.label}</button>`).join("");
    const cat = CATS.find(c => c.key === curCat) || CATS[0];
    const grid = cat.emo.map(e => `<button type="button" class="emo-cell" data-emo="${e}">${e}</button>`).join("");
    panel.innerHTML = `<div class="emo-tabs">${tabs}</div><div class="emo-grid">${grid}</div>`;
    panel.querySelectorAll(".emo-tab").forEach(t => t.addEventListener("click", () => { curCat = t.dataset.cat; renderPanel(true); }));
    panel.querySelectorAll(".emo-cell").forEach(c => c.addEventListener("click", () => insert(c.dataset.emo)));
  }

  function insert(emo) {
    const el = curInput;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + emo + el.value.slice(end);
    const pos = start + emo.length;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
    try { el.setSelectionRange(pos, pos); } catch (e) {}
    window.BattleFX?.haptic?.("tap");
  }

  function positionPanel(btn) {
    const r = btn.getBoundingClientRect();
    buildPanel();
    const w = Math.min(340, window.innerWidth * 0.92);
    let left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    panel.style.width = w + "px";
    panel.style.left = left + "px";
    // 입력창이 화면 하단에 있으므로 버튼 위쪽에 띄움
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
    btn.type = "button";
    btn.className = "emo-btn";
    btn.textContent = "😎";
    btn.setAttribute("aria-label", "이모티콘");
    btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); togglePanel(btn, input); });
    // 전송 버튼 앞에 삽입
    const submit = row.querySelector(".submit-btn, .ic-send, .gif-btn");
    if (submit) row.insertBefore(btn, submit); else row.appendChild(btn);
  }

  // 알려진 컴포저 입력행에 자동 부착
  function scan() {
    attach(document.querySelector(".battle-input-top"), document.getElementById("battle-comment-input"));
    const ic = document.getElementById("inline-composer");
    if (ic) attach(ic.querySelector(".ic-row"), ic.querySelector("#ic-input"));
  }

  window.GALLA_emoticonScan = scan;
  function boot() {
    scan();
    try {
      const mo = new MutationObserver(() => scan());
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
