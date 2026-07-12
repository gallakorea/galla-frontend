/* ===========================================================
   share-sheet.js — 공용 SNS 공유 시트
   window.GALLA_share({ url, title, text })
   - 카카오톡 / X(트위터) / 페이스북 / 텔레그램 / 링크 복사 / 더보기(네이티브)
   - url 은 /share/<type>/<id> (엣지 OG 카드) 를 넣으면 어디 붙여도 미리보기 카드가 뜸
=========================================================== */
(function () {
  if (!document.getElementById("ssh-style")) {
    const st = document.createElement("style"); st.id = "ssh-style";
    st.textContent = `
.ssh-overlay{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.55);backdrop-filter:blur(2px);display:flex;align-items:flex-end;justify-content:center}
.ssh-sheet{width:100%;max-width:480px;background:#16171c;border:1px solid rgba(255,255,255,.08);border-radius:22px 22px 0 0;padding:10px 16px calc(20px + env(safe-area-inset-bottom));transform:translateY(100%);transition:transform .26s cubic-bezier(.2,.8,.3,1)}
.ssh-sheet.show{transform:none}
.ssh-grab{width:40px;height:4px;border-radius:999px;background:#3a3d46;margin:6px auto 14px}
.ssh-title{font-size:15px;font-weight:800;color:#f3f4f6;text-align:center;margin-bottom:16px}
.ssh-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px 8px;padding:0 4px 8px}
.ssh-item{display:flex;flex-direction:column;align-items:center;gap:7px;background:none;border:none;cursor:pointer;padding:0}
.ssh-ic{width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:transform .12s ease}
.ssh-item:active .ssh-ic{transform:scale(.9)}
.ssh-ic svg{width:27px;height:27px}
.ssh-label{font-size:12px;color:#cfd3db;font-weight:600}
.ssh-cancel{width:100%;margin-top:12px;padding:14px;border:none;border-radius:14px;background:rgba(255,255,255,.05);color:#9aa0ad;font-size:15px;font-weight:700;font-family:inherit;cursor:pointer}
.ssh-toast{position:fixed;left:50%;bottom:90px;transform:translate(-50%,10px);z-index:100001;background:rgba(20,21,26,.97);border:1px solid rgba(255,255,255,.1);color:#fff;font-size:13.5px;font-weight:600;padding:11px 18px;border-radius:12px;opacity:0;transition:all .28s ease;pointer-events:none;white-space:nowrap}
.ssh-toast.show{opacity:1;transform:translate(-50%,0)}
`;
    document.head.appendChild(st);
  }
  function el(t, c, h) { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function close() { document.querySelector(".ssh-overlay")?.remove(); }
  function toast(m) {
    const t = el("div", "ssh-toast", m); document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 1800);
  }
  async function copyLink(url) {
    try { await navigator.clipboard.writeText(url); toast("링크를 복사했어요"); }
    catch { const i = el("input"); i.value = url; document.body.appendChild(i); i.select(); document.execCommand("copy"); i.remove(); toast("링크를 복사했어요"); }
  }
  function open(w) { window.open(w, "_blank", "noopener,nowidth"); }

  const ICONS = {
    kakao: '<svg viewBox="0 0 24 24" fill="#3c1e1e"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.2 4.7 6.6-.2.7-.7 2.6-.8 3-.1.5.2.5.4.4.2-.1 2.6-1.8 3.6-2.5.7.1 1.4.1 2.1.1 5.5 0 10-3.6 10-8S17.5 3 12 3z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M18.9 2H22l-7.6 8.7L23 22h-6.8l-5-6.6L5.4 22H2.3l8.1-9.3L1.5 2h7l4.5 6zM17.7 20h1.7L7 4H5.2z"/></svg>',
    fb: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.5V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z"/></svg>',
    tg: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M21.9 4.3 2.9 11.6c-1.1.4-1 1 0 1.3l4.9 1.5 1.8 5.9c.2.6.1.9.8.9.5 0 .7-.2 1-.5l2.4-2.3 5 3.7c.9.5 1.6.3 1.8-.9L23.8 5.4c.3-1.4-.5-2-1.9-1.1z"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="M8 11l8-5M8 13l8 5"/></svg>',
  };

  window.GALLA_share = function (cfg) {
    const url = cfg.url || location.href;
    const title = cfg.title || "GALLA";
    const text = cfg.text || "";
    const eu = encodeURIComponent(url), et = encodeURIComponent(text || title);

    close();
    const ov = el("div", "ssh-overlay");
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    const sheet = el("div", "ssh-sheet");
    sheet.appendChild(el("div", "ssh-grab"));
    sheet.appendChild(el("div", "ssh-title", "공유하기"));

    const grid = el("div", "ssh-grid");
    const items = [
      { k: "kakao", label: "카카오톡", bg: "#FEE500", fn: () => { copyLink(url); toast("링크 복사됨 · 카톡에 붙여넣으면 카드가 떠요"); } },
      { k: "x", label: "X", bg: "#000", fn: () => open(`https://twitter.com/intent/tweet?text=${et}&url=${eu}`) },
      { k: "fb", label: "페이스북", bg: "#1877F2", fn: () => open(`https://www.facebook.com/sharer/sharer.php?u=${eu}`) },
      { k: "tg", label: "텔레그램", bg: "#2AABEE", fn: () => open(`https://t.me/share/url?url=${eu}&text=${et}`) },
      { k: "link", label: "링크 복사", bg: "#2a2c33", fn: () => copyLink(url) },
    ];
    if (navigator.share) items.push({ k: "more", label: "더보기", bg: "#2a2c33", fn: async () => { try { await navigator.share({ title, text, url }); } catch (_) {} } });

    items.forEach(it => {
      const b = el("button", "ssh-item");
      b.innerHTML = `<span class="ssh-ic" style="background:${it.bg}">${ICONS[it.k]}</span><span class="ssh-label">${it.label}</span>`;
      b.onclick = () => { it.fn(); if (it.k !== "link") close(); };
      grid.appendChild(b);
    });
    sheet.appendChild(grid);

    const cancel = el("button", "ssh-cancel", "닫기");
    cancel.onclick = close;
    sheet.appendChild(cancel);

    ov.appendChild(sheet);
    document.body.appendChild(ov);
    requestAnimationFrame(() => sheet.classList.add("show"));
  };
})();
