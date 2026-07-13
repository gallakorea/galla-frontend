/* =========================================================
   😎 스티커 이모티콘 — 갈라 전용 짤(이미지). 팩별 판매
   - 팩: 기본(emoticon_pack) / 감정폭발(sticker_pack_2) / 정시밈(sticker_pack_3)
   - 보유 팩만 삽입 가능, 미보유 팩은 잠금+구매 유도
   - 입력창에 [emo:key] 마커 → 렌더러가 <img>로 변환(모두에게 보임)
   ========================================================= */
(function () {
  const PACKS = [
    { item: "emoticon_pack", label: "⚔️ 기본",
      emo: ["fact","logic","rebut","line","urthink","noconcede","goso","gukrul","sonjeol",
            "pro_yes","con_no","ojz","nono","kkk","gg","legend","bakje","jjin"] },
    { item: "sticker_pack_2", label: "🔥 감정폭발",
      emo: ["e2_king","e2_hyunta","e2_hyeom","e2_sorm","e2_lol","e2_dap","e2_eoi","e2_respect","e2_iduk"] },
    { item: "sticker_pack_3", label: "💢 정시밈",
      emo: ["e3_naeronambul","e3_uche","e3_animyeon","e3_gukppong","e3_bulpyeon","e3_factcheck","e3_aggro","e3_kadera","e3_naepyeon"] },
  ];
  const KEYS = new Set(PACKS.flatMap(p => p.emo));
  const SRC = (k) => `/assets/emoticons/${k}.png`;

  window.GALLA_EMO_KEYS = KEYS;
  window.GALLA_renderEmoticons = function (html) {
    if (!html || html.indexOf("[emo:") === -1) return html;
    return html.replace(/\[emo:([a-z0-9_]+)\]/g, (m, k) =>
      KEYS.has(k) ? `<img class="galla-emo" src="${SRC(k)}" alt="스티커" loading="lazy">` : m);
  };

  const ownCache = {}; // item → bool
  async function owns(item) {
    if (item in ownCache) return ownCache[item];
    try { ownCache[item] = await window.GALLA_hasItem?.(item) || false; }
    catch (e) { ownCache[item] = false; }
    return ownCache[item];
  }
  document.addEventListener("galla:items-changed", () => { for (const k in ownCache) delete ownCache[k]; });

  function css() {
    if (document.getElementById("emo-css")) return;
    const s = document.createElement("style"); s.id = "emo-css";
    s.textContent = `
      .emo-btn{flex:0 0 auto;border:none;background:transparent;font-size:19px;line-height:1;padding:6px;cursor:pointer;border-radius:10px;opacity:.9}
      .emo-btn:hover{background:rgba(255,255,255,.08)}
      .emo-panel{position:fixed;z-index:9999;width:min(360px,94vw);background:#16171c;border:1px solid rgba(255,255,255,.12);
        border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.55);padding:10px;transform:translateY(6px);opacity:0;pointer-events:none;transition:opacity .14s,transform .14s}
      .emo-panel.open{opacity:1;pointer-events:auto;transform:translateY(0)}
      .emo-tabs{display:flex;gap:6px;margin-bottom:8px}
      .emo-tab{flex:1;border:none;background:rgba(255,255,255,.05);color:#c9d1e0;font-size:12px;font-weight:800;padding:7px 0;border-radius:10px;cursor:pointer;white-space:nowrap}
      .emo-tab.on{background:linear-gradient(135deg,#3d6bff,#5b8cff);color:#fff}
      .emo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-height:230px;overflow:auto;padding:2px}
      .emo-cell{border:none;background:transparent;padding:0;cursor:pointer;border-radius:10px}
      .emo-cell img{width:100%;display:block;border-radius:9px}
      .emo-cell:active{transform:scale(.9)}
      .emo-lock{padding:18px 12px;text-align:center;color:#c9d1e0}
      .emo-lock b{color:#c9d1e0}
      .emo-lock button{margin-top:12px;width:100%;padding:11px;border:none;border-radius:12px;background:linear-gradient(135deg,#c9d1e0,#8b93a3);color:#0a0a0b;font-weight:900;cursor:pointer}
      .galla-emo{max-width:150px;width:46vw;height:auto;vertical-align:middle;margin:3px 0;border-radius:10px;display:inline-block}
    `;
    document.head.appendChild(s);
  }

  let panel = null, curInput = null, curPack = 0;
  function buildPanel() {
    if (panel) return panel;
    panel = document.createElement("div"); panel.className = "emo-panel";
    document.body.appendChild(panel);
    document.addEventListener("click", (e) => {
      if (panel.classList.contains("open") && !panel.contains(e.target) && !e.target.closest(".emo-btn")) closePanel();
    });
    window.addEventListener("resize", closePanel);
    window.addEventListener("scroll", closePanel, true);
    return panel;
  }

  async function renderPanel() {
    const tabs = PACKS.map((p, i) => `<button type="button" class="emo-tab${i === curPack ? " on" : ""}" data-pack="${i}">${p.label}</button>`).join("");
    const pack = PACKS[curPack];
    const has = await owns(pack.item);
    let body;
    if (has) {
      body = `<div class="emo-grid">${pack.emo.map(k => `<button type="button" class="emo-cell" data-emo="${k}"><img src="${SRC(k)}" loading="lazy"></button>`).join("")}</div>`;
    } else {
      body = `<div class="emo-lock"><div style="font-size:28px">🔒</div>
        <div style="margin-top:6px"><b>${pack.label}</b> 스티커 팩을 잠금 해제하세요</div>
        <button type="button" id="emo-buy">🛒 상점에서 구매 (1,000 GP)</button></div>`;
    }
    panel.innerHTML = `<div class="emo-tabs">${tabs}</div>${body}`;
    panel.querySelectorAll(".emo-tab").forEach(t => t.addEventListener("click", async () => { curPack = +t.dataset.pack; await renderPanel(); }));
    panel.querySelector("#emo-buy")?.addEventListener("click", () => { closePanel(); window.openShop?.(); });
    panel.querySelectorAll(".emo-cell").forEach(c => c.addEventListener("click", () => insert(c.dataset.emo)));
  }

  function insert(key) {
    const el = curInput; if (!el) return;
    const marker = `[emo:${key}]`;
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
    const w = Math.min(360, window.innerWidth * 0.94);
    panel.style.width = w + "px";
    panel.style.left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8) + "px";
    panel.style.top = "auto"; panel.style.bottom = (window.innerHeight - r.top + 8) + "px";
  }
  function closePanel() { panel?.classList.remove("open"); }
  async function togglePanel(btn, input) {
    buildPanel();
    if (panel.classList.contains("open") && curInput === input) { closePanel(); return; }
    curInput = input; positionPanel(btn);
    await renderPanel();
    requestAnimationFrame(() => panel.classList.add("open"));
  }

  function attach(row, input) {
    if (!row || !input || row.querySelector(":scope > .emo-btn")) return;
    css();
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "emo-btn"; btn.textContent = "😎";
    btn.setAttribute("aria-label", "스티커");
    btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); togglePanel(btn, row.querySelector("input") || input); });
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
