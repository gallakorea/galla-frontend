/* =========================================================
   댓글 수정/삭제 공용 모듈 — 모든 게시물(이슈·광장·예측·뉴스) 댓글
   - 본인 + 관리자(admin_flag)만. RLS가 서버에서 최종 강제
   - 위임: [data-cmt-menu] 버튼 클릭 → 바텀시트(수정/삭제)
     data-cmt-table, data-cmt-id, data-cmt-uid, data-cmt-bodycol(기본 content),
     data-cmt-soft(1이면 status='deleted' 소프트삭제)
   - 컨테이너 [data-cmt-item], 본문 [data-cmt-text] → 삭제 시 제거·수정 시 텍스트 갱신
   - 자체 CSS 주입
   ========================================================= */
(function () {
  // 페이지마다 클라이언트 전역명이 다름(issue/search=supabaseClient, plaza=supabase). .from 있는 쪽 선택
  const sb = () => {
    const c = window.supabaseClient; if (c && c.from) return c;
    const s = window.supabase; if (s && s.from) return s;
    return c || s;
  };
  let _me = undefined, _admin = null;
  async function me() {
    if (_me !== undefined) return _me;
    try { const { data } = await sb().auth.getSession(); _me = data?.session?.user?.id || null; }
    catch (e) { _me = null; }
    return _me;
  }
  async function isAdmin() {
    if (_admin !== null) return _admin;
    const uid = await me();
    if (!uid) return (_admin = false);
    try {
      const { data } = await sb().from("user_profiles").select("admin_flag").eq("user_id", uid).maybeSingle();
      _admin = !!data?.admin_flag;
    } catch (e) { _admin = false; }
    return _admin;
  }
  window.GALLA_cmtCanManage = async (uid) => { const m = await me(); return !!(m && (m === uid)) || await isAdmin(); };

  function css() {
    if (document.getElementById("cmt-act-css")) return;
    const s = document.createElement("style"); s.id = "cmt-act-css";
    s.textContent = `
      .cmt-mini{border:none;background:transparent;color:#8a8f9a;cursor:pointer;font-size:16px;line-height:1;padding:2px 6px;border-radius:8px}
      .cmt-mini:active{background:rgba(255,255,255,.08)}
      .cmt-sheet{position:fixed;inset:0;z-index:99998;display:flex;align-items:flex-end;justify-content:center}
      .cmt-sheet .dim{position:absolute;inset:0;background:rgba(0,0,0,.5)}
      .cmt-sheet .card{position:relative;width:100%;max-width:480px;background:#16171c;border-radius:18px 18px 0 0;
        padding:8px 0 max(8px,env(safe-area-inset-bottom));animation:cmtUp .22s ease}
      .cmt-sheet .opt{display:flex;gap:10px;align-items:center;width:100%;padding:15px 20px;border:none;background:transparent;
        color:#eef0f4;font-size:15px;font-weight:700;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.06)}
      .cmt-sheet .opt.danger{color:#ff6f88}
      .cmt-sheet .opt:active{background:rgba(255,255,255,.06)}
      .cmt-sheet .cancel{width:100%;padding:15px;border:none;background:transparent;color:#8a8f9a;font-weight:800;cursor:pointer}
      @keyframes cmtUp{from{transform:translateY(100%)}}
      .cmt-edit{position:fixed;inset:0;z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding:calc(64px + env(safe-area-inset-top)) 16px 16px}
      .cmt-edit .dim{position:absolute;inset:0;background:rgba(0,0,0,.6)}
      .cmt-edit .box{position:relative;width:100%;max-width:440px;background:#16171c;border:1px solid rgba(255,255,255,.12);
        border-radius:18px;padding:16px;animation:cmtUp .2s ease}
      .cmt-edit h4{margin:0 0 10px;color:#f5f5f2;font-size:15px}
      .cmt-edit textarea{width:100%;min-height:110px;background:#0c0c0f;border:1px solid rgba(255,255,255,.14);
        border-radius:12px;color:#fff;padding:12px;font-size:15px;font-family:inherit;line-height:1.5;resize:vertical}
      .cmt-edit .row{display:flex;gap:8px;margin-top:12px}
      .cmt-edit .row button{flex:1;padding:12px;border:none;border-radius:12px;font-weight:900;font-size:14px;cursor:pointer}
      .cmt-edit .save{background:linear-gradient(135deg,#3d6bff,#5b8cff);color:#fff}
      .cmt-edit .cancel2{background:rgba(255,255,255,.08);color:#c9d1e0}
    `;
    document.head.appendChild(s);
  }
  // ⋯ 버튼(.cmt-mini)이 시트를 열기 전까지 기본 브라우저 버튼(테두리 박스)으로
  // 보이던 문제 — 스타일을 로드 즉시 주입한다
  if (document.head) css(); else document.addEventListener("DOMContentLoaded", css);

  window.GALLA_cmtEdit = function ({ table, id, bodyCol = "content", current = "", onSaved }) {
    css();
    document.getElementById("cmt-edit")?.remove();
    const wrap = document.createElement("div"); wrap.id = "cmt-edit"; wrap.className = "cmt-edit";
    wrap.innerHTML = `<div class="dim"></div><div class="box">
      <h4>✏️ 댓글 수정</h4>
      <textarea id="cmt-edit-ta" maxlength="1000"></textarea>
      <div class="row"><button class="cancel2" id="cmt-edit-x">취소</button><button class="save" id="cmt-edit-s">저장</button></div>
    </div>`;
    document.body.appendChild(wrap);
    const ta = wrap.querySelector("#cmt-edit-ta"); ta.value = current; ta.focus();
    const close = () => wrap.remove();
    wrap.querySelector(".dim").onclick = close;
    wrap.querySelector("#cmt-edit-x").onclick = close;
    wrap.querySelector("#cmt-edit-s").onclick = async () => {
      const v = ta.value.trim();
      if (!v) { ta.focus(); return; }
      const btn = wrap.querySelector("#cmt-edit-s"); btn.disabled = true; btn.textContent = "저장 중…";
      const { error } = await sb().from(table).update({ [bodyCol]: v }).eq("id", id);
      if (error) { btn.disabled = false; btn.textContent = "저장"; alert("수정에 실패했어요: " + (error.message || "")); return; }
      close();
      window.GALLA_toast && GALLA_toast("✅ 댓글을 수정했어요");
      onSaved && onSaved(v);
    };
  };

  window.GALLA_cmtDelete = async function ({ table, id, soft, onDone }) {
    if (!confirm("이 댓글을 삭제할까요?")) return;
    let error;
    if (soft) ({ error } = await sb().from(table).update({ status: "deleted" }).eq("id", id));
    else ({ error } = await sb().from(table).delete().eq("id", id));
    if (error) { alert("삭제에 실패했어요: " + (error.message || "")); return; }
    window.GALLA_toast && GALLA_toast("🗑️ 댓글을 삭제했어요");
    onDone && onDone();
  };

  window.GALLA_openCommentMenu = async function (opts) {
    css();
    document.getElementById("cmt-sheet")?.remove();
    const canManage = await GALLA_cmtCanManage(opts.uid);
    const sheet = document.createElement("div"); sheet.id = "cmt-sheet"; sheet.className = "cmt-sheet";
    const rows = [];
    if (canManage) {
      rows.push(`<button class="opt" data-a="edit">✏️ 수정</button>`);
      rows.push(`<button class="opt danger" data-a="del">🗑️ 삭제</button>`);
    } else {
      rows.push(`<button class="opt" data-a="report">🚨 신고</button>`);
    }
    sheet.innerHTML = `<div class="dim"></div><div class="card">${rows.join("")}<button class="cancel">닫기</button></div>`;
    document.body.appendChild(sheet);
    const close = () => sheet.remove();
    sheet.querySelector(".dim").onclick = close;
    sheet.querySelector(".cancel").onclick = close;
    sheet.querySelectorAll(".opt").forEach(b => b.onclick = () => {
      const a = b.dataset.a; close();
      if (a === "edit") GALLA_cmtEdit({ table: opts.table, id: opts.id, bodyCol: opts.bodyCol, current: opts.current, onSaved: opts.onEdited });
      else if (a === "del") GALLA_cmtDelete({ table: opts.table, id: opts.id, soft: opts.soft, onDone: opts.onDeleted });
      else if (a === "report") window.GALLA_openReportMenu?.({ contentType: "comment", contentId: opts.id, authorId: opts.uid });
    });
  };

  // 위임: [data-cmt-menu]
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cmt-menu]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const item = b.closest("[data-cmt-item]");
    const textEl = item?.querySelector("[data-cmt-text]");
    GALLA_openCommentMenu({
      table: b.dataset.cmtTable, id: b.dataset.cmtId, uid: b.dataset.cmtUid,
      bodyCol: b.dataset.cmtBodycol || "content", soft: b.dataset.cmtSoft === "1",
      current: textEl ? textEl.textContent : "",
      onEdited: (txt) => { if (textEl) textEl.textContent = txt; },
      onDeleted: () => { item ? item.remove() : b.closest("*")?.remove(); },
    });
  }, true);
})();
