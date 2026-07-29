/* ===========================================================
   report-block.js — 콘텐츠 ⋯ 메뉴(비소유자용): 신고 / 계정 차단
   window.GALLA_openReportMenu({ contentType, contentId, authorId, authorName, onBlocked })
   - 신고: content_reports insert (사유 선택)
   - 차단: user_blocks insert → onBlocked() (해당 콘텐츠 숨김)
=========================================================== */
(function () {
  /* 이모지는 기기마다 모양·크기가 달라 시트 정렬이 깨진다 → SVG로 통일 */
  const rbSvg = (d) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const RB_IC = {
    report: rbSvg('<path d="M10.3 3.9L1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
    block:  rbSvg('<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>'),
  };

  if (!document.getElementById("rb-style")) {
    const st = document.createElement("style"); st.id = "rb-style";
    st.textContent = `
.rb-overlay{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.55);backdrop-filter:blur(2px);display:flex;align-items:flex-end;justify-content:center}
.rb-sheet{width:100%;max-width:480px;background:#16171c;border:1px solid rgba(255,255,255,.08);border-radius:20px 20px 0 0;padding:10px 14px calc(18px + env(safe-area-inset-bottom));transform:translateY(100%);transition:transform .24s cubic-bezier(.2,.8,.3,1)}
.rb-sheet.show{transform:none}
.rb-grab{width:40px;height:4px;border-radius:999px;background:#3a3d46;margin:6px auto 12px}
.rb-title{font-size:13px;font-weight:700;color:#9aa0ad;text-align:center;margin-bottom:10px}
.rb-item{width:100%;display:flex;align-items:center;gap:10px;padding:15px 14px;border:none;background:rgba(255,255,255,.03);border-radius:13px;color:#f3f4f6;font-size:15px;font-weight:600;font-family:inherit;cursor:pointer;margin-bottom:8px;text-align:left}
.rb-item:active{background:rgba(255,255,255,.07)}
.rb-ic{flex:0 0 22px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;color:#c9d1e0}
.rb-ic svg{width:21px;height:21px;display:block}
.rb-danger .rb-ic{color:#ff4d67}
.rb-danger{color:#ff4d67}
.rb-cancel{justify-content:center;color:#9aa0ad;background:none}
.rb-overlay .rb-modal{align-self:center;width:calc(100% - 40px);max-width:400px;background:#16171c;border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:22px 20px;transform:scale(.94);opacity:0;transition:all .18s ease}
.rb-modal.show{transform:none;opacity:1}
.rb-modal-title{font-size:17px;font-weight:800;color:#fff;margin-bottom:12px}
.rb-desc{font-size:13.5px;line-height:1.6;color:#9aa0ad;margin-bottom:18px}
.rb-row{display:flex;gap:10px;margin-top:8px}
.rb-btn{flex:1;padding:13px;border:none;border-radius:12px;font-size:14.5px;font-weight:800;font-family:inherit;cursor:pointer}
.rb-ghost{background:rgba(255,255,255,.06);color:#cfd3db}
.rb-block{background:#ff4d67;color:#fff}
.rb-btn:disabled{opacity:.6}
.rb-toast{position:fixed;left:50%;bottom:90px;transform:translate(-50%,10px);z-index:100001;background:rgba(20,21,26,.97);border:1px solid rgba(255,255,255,.1);color:#fff;font-size:13.5px;font-weight:600;padding:11px 18px;border-radius:12px;opacity:0;transition:all .28s ease;pointer-events:none}
.rb-toast.show{opacity:1;transform:translate(-50%,0)}
`;
    document.head.appendChild(st);
  }
  function sb() {
    const c = window.supabaseClient; if (c && c.auth && c.from) return c;
    const s = window.supabase; if (s && s.auth && s.from) return s; return null;
  }
  function el(t, c, h) { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function close() { document.querySelector(".rb-overlay")?.remove(); }
  function toast(m) {
    const t = el("div", "rb-toast", m); document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 1900);
  }
  function overlay() {
    close();
    const ov = el("div", "rb-overlay");
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    document.body.appendChild(ov);
    return ov;
  }

  const REASONS = ["스팸/광고", "욕설/혐오 발언", "음란물/불법정보", "허위사실/사기", "폭력/자해 조장", "기타"];

  async function requireLogin() {
    const client = sb(); if (!client) return null;
    const { data } = await client.auth.getUser();
    const uid = data?.user?.id || null;
    if (!uid) { if (confirm("로그인이 필요합니다. 로그인할까요?")) (window.GALLA_nav||function(u){location.href=u})("login.html"); return null; }
    return uid;
  }

  function openMenu(cfg) {
    const ov = overlay();
    const sheet = el("div", "rb-sheet");
    sheet.appendChild(el("div", "rb-grab"));
    const rep = el("button", "rb-item", `<span class="rb-ic">${RB_IC.report}</span> 신고하기`);
    rep.onclick = () => { close(); openReport(cfg); };
    sheet.appendChild(rep);
    const blk = el("button", "rb-item rb-danger", `<span class="rb-ic">${RB_IC.block}</span> ${cfg.authorName ? cfg.authorName + " " : ""}계정 차단`);
    blk.onclick = () => { close(); confirmBlock(cfg); };
    if (cfg.authorId) sheet.appendChild(blk);
    const cancel = el("button", "rb-item rb-cancel", "닫기");
    cancel.onclick = close;
    sheet.appendChild(cancel);
    ov.appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add("show"));
  }

  function openReport(cfg) {
    const ov = overlay();
    const sheet = el("div", "rb-sheet");
    sheet.appendChild(el("div", "rb-grab"));
    sheet.appendChild(el("div", "rb-title", "신고 사유를 선택하세요"));
    REASONS.forEach(reason => {
      const b = el("button", "rb-item", reason);
      b.onclick = async () => {
        const uid = await requireLogin(); if (!uid) return;
        close();
        try {
          const { error } = await sb().from("content_reports").insert({
            reporter_id: uid, content_type: cfg.contentType, content_id: String(cfg.contentId), reason,
          });
          if (error) throw error;
          toast("신고가 접수되었어요. 검토 후 조치할게요.");
        } catch (e) { toast("신고 실패: " + (e.message || e)); }
      };
      sheet.appendChild(b);
    });
    const cancel = el("button", "rb-item rb-cancel", "취소");
    cancel.onclick = close;
    sheet.appendChild(cancel);
    ov.appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add("show"));
  }

  function confirmBlock(cfg) {
    const ov = overlay();
    const modal = el("div", "rb-modal");
    modal.appendChild(el("div", "rb-modal-title", `${cfg.authorName || "이 사용자"}님을 차단할까요?`));
    modal.appendChild(el("p", "rb-desc", "차단하면 이 사용자의 갈라·댓글이 더 이상 보이지 않습니다."));
    const row = el("div", "rb-row");
    const cancel = el("button", "rb-btn rb-ghost", "취소"); cancel.onclick = close;
    const ok = el("button", "rb-btn rb-block", "차단");
    ok.onclick = async () => {
      const uid = await requireLogin(); if (!uid) return;
      ok.disabled = true; ok.textContent = "차단 중…";
      try {
        const { error } = await sb().from("user_blocks").upsert({ blocker_id: uid, blocked_id: cfg.authorId }, { onConflict: "blocker_id,blocked_id" });
        if (error) throw error;
        close();
        toast("차단했어요.");
        if (cfg.onBlocked) cfg.onBlocked();
      } catch (e) { ok.disabled = false; ok.textContent = "차단"; toast("차단 실패: " + (e.message || e)); }
    };
    row.appendChild(cancel); row.appendChild(ok);
    modal.appendChild(row);
    ov.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add("show"));
  }

  // 내가 차단한 사용자 id 목록 (피드 필터용, 캐시)
  window.GALLA_blockedIds = async function () {
    if (window.__GALLA_BLOCKED__) return window.__GALLA_BLOCKED__;
    const client = sb(); if (!client) return new Set();
    const { data } = await client.auth.getUser();
    const uid = data?.user?.id; if (!uid) return new Set();
    const { data: rows } = await client.from("user_blocks").select("blocked_id").eq("blocker_id", uid);
    window.__GALLA_BLOCKED__ = new Set((rows || []).map(r => r.blocked_id));
    return window.__GALLA_BLOCKED__;
  };

  window.GALLA_openReportMenu = openMenu;
})();
