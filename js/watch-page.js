/* ═══════════════════════════════════════════════════════════════
 * watch-page.js — 핫튜브 시청 '진짜 SPA 페이지'(watch.html · 스택 라우트).
 *   기존 오버레이(#hv-player)를 대체. 목록(hot-videos.js)이 카드 탭 시
 *   GALLA_nav('watch.html?v=ID&t=제목&c=채널') 로 넘겨 라우터가 push(슬라이드인/엣지백/pop)한다.
 *   → 뒤로가기·전환이 라우터 스택으로 100% 관리되는 실 SPA 페이지.
 *   재생은 galla.im/yt 프록시(capacitor origin 오류153 회피). 다음영상은 제자리 교체.
 * 계약: window.GALLA_PAGE_WATCH = { mount(root, params), unmount() }
 * ═══════════════════════════════════════════════════════════════ */
(function () {
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const shortNum = (n) => {
    n = Number(n) || 0;
    if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, "") + "억";
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "만";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "천";
    return String(n);
  };
  const timeAgo = (iso) => {
    if (!iso) return "";
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 3600) return Math.max(1, Math.floor(d / 60)) + "분 전";
    if (d < 86400) return Math.floor(d / 3600) + "시간 전";
    if (d < 604800) return Math.floor(d / 86400) + "일 전";
    return Math.floor(d / 604800) + "주 전";
  };
  const fmtDur = (iso) => {
    const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
    if (!m) return "";
    const h = +(m[1] || 0), mi = +(m[2] || 0), s = +(m[3] || 0);
    return h ? `${h}:${String(mi).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${mi}:${String(s).padStart(2, "0")}`;
  };
  const YT_PROXY = "https://galla.im/yt";   // capacitor origin 오류153 회피 프록시(정식 https origin)

  async function sb() {
    return window.supabaseClient ||
      (window.waitForSupabaseClient ? await window.waitForSupabaseClient() : null);
  }

  let R = null;                 // 현재 마운트된 루트(view-host 또는 document)
  let vid = null, vtitle = "", vch = "";
  let liked = false, likeN = 0, replyTo = null;
  const q = (s) => (R ? R.querySelector(s) : null);

  /* ---------- 마크업 ---------- */
  function render(title, ch) {
    return `
    <div class="hv-box watch-box">
      <div class="watch-topbar">
        <button type="button" class="hv-back" id="hvBack" aria-label="뒤로">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      </div>
      <div class="hv-frame" id="hvFrame"></div>

      <div class="hv-head">
        <span class="hv-title" id="hvTitle">${esc(title)}</span>
        <span class="hv-chname" id="hvCh">${esc(ch)}</span>
      </div>

      <div class="hv-social">
        <!-- ⚠️ 하트 심볼을 두지 않는다. YouTube ToS 통보서(III.E.4h)의 지시가
             "replace the highlighted symbol with the term 'likes'" 였다 —
             심볼을 없애고 '단어'로 표기하라는 뜻이다. -->
        <button type="button" class="hv-sb hv-sb-txt" id="hvLike">
          <span id="hvLikeN">갈라 좋아요</span>
        </button>
        <button type="button" class="hv-sb" id="hvComment">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z"/></svg>
          <span id="hvCommentN">0</span>
        </button>
        <button type="button" class="hv-sb" id="hvShare">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2.5L10.8 13.2"/><path d="M21.5 2.5l-6.8 19-3.9-8.3-8.3-3.9 19-6.8z"/></svg>
          <span>공유</span>
        </button>
        <button type="button" class="hv-sb" id="hvGalvis" data-galvis data-gv-type="hottube" data-gv-id="" data-gv-title="" aria-label="갈비스와 얘기">
          <svg class="gv-galvis" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="8.2" stroke-width="1.5" stroke-dasharray="2.3 2.2"/><circle cx="12" cy="12" r="4.7" stroke-width="1.3"/><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/></svg>
          <span>갈비스</span>
        </button>
      </div>

      <div class="hv-cmt-wrap hidden" id="hvCmtWrap">
        <div class="hv-cmt-list" id="hvCmtList"></div>
        <div class="hv-replyto" id="hvReplyTo" hidden>
          <span><b id="hvReplyNick"></b>님에게 답글</span>
          <button type="button" id="hvReplyX" aria-label="취소">✕</button>
        </div>
        <div class="hv-cmt-bar">
          <input id="hvCmtInput" class="hv-cmt-in" placeholder="댓글 남기기…" maxlength="1000" autocomplete="off">
          <button type="button" class="ghost-toggle sm" id="hvGhost" title="유령으로 활동"><span class="gt-ic">👻</span></button>
          <button type="button" class="hv-cmt-send" id="hvCmtSend">게시</button>
        </div>
      </div>

      <div class="hv-actions">
        <a class="hv-yt" id="hvOpen" href="#" target="_blank" rel="noopener noreferrer">유튜브에서 보기 ↗</a>
        <button type="button" class="hv-galla" id="hvGalla" disabled>⚔️ 갈라 <em>준비 중</em></button>
      </div>

      <div class="hv-related" id="hvRelated"></div>
    </div>`;
  }

  /* 제목·채널이 비어 있으면 DB 에서 채운다.
     ⚠️ 목록에서 들어올 때만 제목/채널이 넘어오고, 주소로 직접 열면(공유 링크·새 탭)
        둘 다 빈 채로 남았다. 영상 출처(채널명)가 안 보이는 화면이 만들어진다. */
  async function fillMeta(id) {
    if (!id || (vtitle && vch)) return;
    try {
      const c = await sb(); if (!c) return;
      const { data } = await c.from("youtube_hot")
        .select("title,channel_title").eq("video_id", id).limit(1).maybeSingle();
      if (!data) return;
      if (!vtitle && data.title) { vtitle = data.title; const t = q("#hvTitle"); if (t) t.textContent = vtitle; }
      if (!vch && data.channel_title) { vch = data.channel_title; const e = q("#hvCh"); if (e) e.textContent = vch; }
      const ifr = q("#hvFrame iframe"); if (ifr && vtitle) ifr.title = vtitle;
    } catch (_) {}
  }

  /* ---------- 재생 ---------- */
  function playInto(id, title, ch) {
    vid = id; vtitle = title || ""; vch = ch || "";
    const t = q("#hvTitle"); if (t) t.textContent = vtitle;
    const c = q("#hvCh"); if (c) c.textContent = vch;
    fillMeta(id);
    const gv = q("#hvGalvis"); if (gv) { gv.setAttribute("data-gv-id", id || ""); gv.setAttribute("data-gv-title", vtitle); }
    const open = q("#hvOpen"); if (open) open.href = `https://www.youtube.com/watch?v=${id}`;
    const frame = q("#hvFrame");
    if (frame) {
      frame.innerHTML = "";
      const ifr = document.createElement("iframe");
      ifr.src = `${YT_PROXY}?v=${encodeURIComponent(id)}`;
      ifr.title = vtitle;
      ifr.setAttribute("frameborder", "0");
      ifr.setAttribute("allow", "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen");
      ifr.setAttribute("allowfullscreen", "");
      frame.appendChild(ifr);
    }
    const w = q("#hvCmtWrap"); if (w) w.classList.add("hidden");
    setReply(null);
    try { R && (R.scrollTop = 0); } catch (_) {}
    const box = q(".watch-box"); if (box) box.scrollTop = 0;
    loadRelated(id);
    loadSocial();
  }

  /* ---------- 갈라 자체 소셜 ---------- */
  async function loadSocial() {
    const c = await sb();
    if (!c || !vid) return;
    const { data } = await c.rpc("video_social", { p_ids: [vid] });
    const s = (data || [])[0] || { likes: 0, comments: 0, liked: false };
    liked = !!s.liked; likeN = Number(s.likes) || 0;
    paintLike();
    const cn = q("#hvCommentN"); if (cn) cn.textContent = shortNum(s.comments);
  }
  function paintLike() {
    const b = q("#hvLike"); if (b) b.classList.toggle("on", liked);
    const n = q("#hvLikeN"); if (n) n.textContent = likeN ? `${shortNum(likeN)} 갈라 좋아요` : "갈라 좋아요";
  }
  async function me() {
    const c = await sb();
    const { data: { user } } = await c.auth.getUser();
    if (!user) { (window.GALLA_nav || function (u) { location.href = u; })("login.html"); return null; }
    return user;
  }
  async function toggleLike() {
    const user = await me(); if (!user) return;
    const c = await sb();
    const was = liked; liked = !liked; likeN += liked ? 1 : -1; paintLike();
    const { error } = liked
      ? await c.from("video_likes").insert({ video_id: vid, user_id: user.id })
      : await c.from("video_likes").delete().eq("video_id", vid).eq("user_id", user.id);
    if (error) { liked = was; likeN += liked ? 1 : -1; paintLike(); }
  }

  /* ---------- 댓글 ---------- */
  function cmtHTML(m, isReply) {
    const gh = m.is_anonymous && window.GALLA_ghost ? window.GALLA_ghost(m.ghost_seed) : null;
    const uAttr = !gh && m.user_id ? ` data-user-id="${esc(m.user_id)}" data-user-nick="${esc(m.nickname || "")}" style="cursor:pointer"` : "";
    const av = gh
      ? `<span class="hv-cmt-av hv-cmt-av0 ghost-nick" style="padding:0;background:none">${gh.avatarHTML}</span>`
      : (m.avatar_url
        ? `<img class="hv-cmt-av" src="${esc(window.GALLA_avatarSrc ? window.GALLA_avatarSrc(m.avatar_url) : m.avatar_url)}" alt=""${uAttr}>`
        : `<span class="hv-cmt-av hv-cmt-av0"${uAttr}>${esc((m.nickname || "갈")[0])}</span>`);
    const nickAttr = !gh && m.user_id ? ` data-nick-uid="${esc(m.user_id)}"` : "";
    const nameHtml = gh
      ? `<span class="hv-cmt-n ghost-nick" style="color:${gh.color}">${gh.name}</span>`
      : `<span class="hv-cmt-n"${uAttr}${nickAttr}>${esc(m.nickname)}</span>`;
    return `
      <div class="hv-cmt${isReply ? " hv-cmt-r" : ""}" data-cid="${m.id}">
        ${av}
        <div class="hv-cmt-b">
          <div class="hv-cmt-h">${nameHtml}<span class="hv-cmt-d">${timeAgo(m.created_at)}</span></div>
          <div class="hv-cmt-t">${esc(m.body)}</div>
          <div class="hv-cmt-a">
            <button type="button" class="hv-cl${m.liked ? " on" : ""}" data-like="${m.id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.3l-1.4-1.3C5.4 14.4 2 11.3 2 7.5 2 4.4 4.4 2 7.5 2c1.7 0 3.4.8 4.5 2.1C13.1 2.8 14.8 2 16.5 2 19.6 2 22 4.4 22 7.5c0 3.8-3.4 6.9-8.6 11.5L12 20.3z"/></svg>
              <span>${Number(m.likes) || ""}</span>
            </button>
            ${isReply ? "" : `<button type="button" class="hv-cr" data-reply="${m.id}" data-nick="${esc(gh ? gh.name : m.nickname)}">답글</button>`}
            <button type="button" class="hv-cshare" data-cshare="${m.id}" data-body="${esc(m.body || "")}" aria-label="댓글 공유">🔗</button>
            ${m.mine ? `<button type="button" class="hv-cx" data-del="${m.id}">삭제</button>` : ""}
          </div>
        </div>
      </div>`;
  }
  async function loadComments() {
    const box = q("#hvCmtList");
    if (!box) return;
    box.innerHTML = `<div class="hv-cmt-empty">불러오는 중…</div>`;
    const c = await sb();
    const { data, error } = await c.rpc("video_comment_list", { p_video_id: vid });
    if (error || !data?.length) {
      box.innerHTML = `<div class="hv-cmt-empty">첫 댓글을 남겨보세요.</div>`;
      const cn = q("#hvCommentN"); if (cn) cn.textContent = "0";
      return;
    }
    if (window.GALLA_userMap) await window.GALLA_userMap(data.map((m) => m.user_id));
    box.innerHTML = data.map((m) => cmtHTML(m, !!m.parent_id)).join("");
    const cn = q("#hvCommentN"); if (cn) cn.textContent = shortNum(data.length);
  }
  function setReply(id, nick) {
    replyTo = id;
    const bar = q("#hvReplyTo");
    if (!bar) return;
    if (id) { bar.hidden = false; const n = q("#hvReplyNick"); if (n) n.textContent = nick; const i = q("#hvCmtInput"); if (i) i.focus(); }
    else bar.hidden = true;
  }
  async function sendComment() {
    const inp = q("#hvCmtInput");
    if (!inp) return;
    const body = inp.value.trim();
    if (!body) return;
    const user = await me(); if (!user) return;
    const c = await sb();
    inp.value = "";
    const ghostBtn = q("#hvGhost");
    const row = { video_id: vid, user_id: user.id, body, is_anonymous: ghostBtn?.classList.contains("on") === true };
    if (replyTo) row.parent_id = replyTo;
    const { error } = await c.from("video_comments").insert(row);
    if (error) { inp.value = body; if (window.GALLA_ghostInsertError) window.GALLA_ghostInsertError(error, ghostBtn); return; }
    window.GALLA_toast && GALLA_toast(replyTo ? "💬 답글이 등록됐어요" : "💬 댓글이 등록됐어요");
    setReply(null);
    loadComments();
  }
  async function toggleCmtLike(id, btn) {
    const user = await me(); if (!user) return;
    const c = await sb();
    const on = btn.classList.toggle("on");
    const span = btn.querySelector("span");
    const n = (Number(span.textContent) || 0) + (on ? 1 : -1);
    span.textContent = n > 0 ? n : "";
    const { error } = on
      ? await c.from("video_comment_likes").insert({ comment_id: id, user_id: user.id })
      : await c.from("video_comment_likes").delete().eq("comment_id", id).eq("user_id", user.id);
    if (error) loadComments();
  }
  async function delComment(id) {
    const c = await sb();
    await c.from("video_comments").delete().eq("id", id);
    loadComments();
  }

  /* ---------- 공유 ---------- */
  function share() {
    const url = `${location.origin}/share/video/${encodeURIComponent(vid)}`;
    if (window.GALLA_share) { window.GALLA_share({ url, title: `🎬 ${vtitle}`, text: `지금 갈라에서 가장 뜨거운 영상 — ${vtitle}` }); return; }
    try {
      if (navigator.share) { navigator.share({ title: `🎬 ${vtitle}`, url }); return; }
      navigator.clipboard.writeText(url);
      window.GALLA_toast && GALLA_toast("갈라 공유 링크를 복사했어요");
    } catch (_) {}
  }

  /* ---------- 다음 영상(제자리 교체) ---------- */
  async function loadRelated(curId) {
    const box = q("#hvRelated");
    if (!box) return;
    try {
      const c = await sb();
      if (!c) return;
      const { data } = await c.from("youtube_hot")
        .select("video_id,title,channel_title,thumbnail,view_count,duration")
        .neq("video_id", curId)
        .not("channel_title", "ilike", "%- Topic")
        .order("view_count", { ascending: false, nullsFirst: false })
        .limit(40);
      const seen = new Set([curId]);
      const list = (data || []).filter((v) => v && v.video_id && !seen.has(v.video_id) && seen.add(v.video_id)).slice(0, 15);
      if (!list.length) { box.innerHTML = ""; return; }
      box.innerHTML = '<div class="hv-related-h">다음 영상</div>' + list.map((v) => `
        <div class="hv-rel" data-id="${esc(v.video_id)}" data-title="${esc(v.title || "")}" data-ch="${esc(v.channel_title || "")}">
          <div class="hv-rel-thumb">
            ${v.thumbnail ? `<img src="${esc(v.thumbnail)}" loading="lazy" onerror="this.style.display='none'">` : ""}
            ${v.duration ? `<span class="hv-rel-dur">${esc(fmtDur(v.duration))}</span>` : ""}
          </div>
          <div class="hv-rel-info">
            <div class="hv-rel-t">${esc(v.title || "(제목 없음)")}</div>
            <div class="hv-rel-m">${esc(v.channel_title || "")}${v.view_count ? " · 조회 " + shortNum(v.view_count) : ""}</div>
          </div>
        </div>`).join("");
    } catch (_) { box.innerHTML = ""; }
  }

  /* ---------- 바인딩 ---------- */
  function bind() {
    q("#hvBack")?.addEventListener("click", () => { try { history.back(); } catch (_) { location.href = "search.html"; } });
    q("#hvLike")?.addEventListener("click", toggleLike);
    q("#hvShare")?.addEventListener("click", share);
    q("#hvComment")?.addEventListener("click", () => {
      const w = q("#hvCmtWrap");
      w.classList.toggle("hidden");
      if (!w.classList.contains("hidden")) loadComments();
    });
    window.GALLA_ghostBind && window.GALLA_ghostBind(q("#hvGhost"));
    q("#hvCmtSend")?.addEventListener("click", sendComment);
    q("#hvCmtInput")?.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment(); } });
    q("#hvReplyX")?.addEventListener("click", () => setReply(null));
    q("#hvCmtList")?.addEventListener("click", (e) => {
      const l = e.target.closest("[data-like]"); if (l) { toggleCmtLike(Number(l.dataset.like), l); return; }
      const r = e.target.closest("[data-reply]"); if (r) { setReply(Number(r.dataset.reply), r.dataset.nick); return; }
      const d = e.target.closest("[data-del]"); if (d) { delComment(Number(d.dataset.del)); return; }
      const s = e.target.closest("[data-cshare]");
      if (s) {
        const cid = s.dataset.cshare;
        const url = window.GALLA_shareCommentUrl ? window.GALLA_shareCommentUrl("video", cid) : (location.origin + "/share/comment/video/" + cid);
        const raw = String(s.dataset.body || "").replace(/\s+/g, " ").trim();
        const title = "🗯️ " + (raw ? `“${raw.slice(0, 40)}”` : "이 댓글");
        const text = "갈라에서 이 댓글에 받아쳐봐";
        if (window.GALLA_share) window.GALLA_share({ url, title, text });
        else if (navigator.share) navigator.share({ title, text, url }).catch(() => {});
        else { try { navigator.clipboard.writeText(url); window.GALLA_toast && GALLA_toast("🔗 댓글 링크 복사됨"); } catch (_) {} }
        return;
      }
    });
    // 다음 영상 — 페이지 안 벗어나고 제자리 교체(유튜브식). 스택 유지(뒤로가기=목록).
    q("#hvRelated")?.addEventListener("click", (e) => {
      const el = e.target.closest(".hv-rel");
      if (!el) return;
      playInto(el.dataset.id, el.dataset.title || "", el.dataset.ch || "");
    });
  }

  /* ---------- SPA 계약 ---------- */
  window.GALLA_PAGE_WATCH = {
    async mount(root, params) {
      R = root || document;
      params = params || {};
      const id = params.v || params.id || "";
      const title = params.t || params.title || "";
      const ch = params.c || params.ch || "";
      // 호스트에 마크업 주입(정적 껍데기가 이미 있으면 재사용)
      let host = R.querySelector ? R.querySelector("#watch-root") : null;
      if (!host) {
        host = document.createElement("div");
        host.id = "watch-root";
        (R.body || R).appendChild(host);
      }
      host.innerHTML = render(title, ch);
      R = host;   // 이후 셀렉터는 watch-root 기준
      bind();
      document.body.classList.add("hv-playing");   // 🤖 갈비스 오브 숨김(플레이어와 겹침 방지)
      if (id) playInto(id, title, ch);
    },
    unmount() {
      const f = q("#hvFrame"); if (f) { const ifr = f.querySelector("iframe"); if (ifr) ifr.src = "about:blank"; }
      document.body.classList.remove("hv-playing");
      vid = null;
    },
  };

  // 웹 MPA(watch.html 직접 로드) — SPA가 아니면 URL 파라미터로 자체 부팅.
  function mpaBoot() {
    if (document.body && document.body.dataset.page === "spa") return;   // SPA는 라우터가 mount
    const p = {};
    new URLSearchParams(location.search).forEach((v, k) => (p[k] = v));
    const host = document.getElementById("watch-root") || document.body;
    window.GALLA_PAGE_WATCH.mount(host.id === "watch-root" ? host : document.body, p);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mpaBoot);
  else mpaBoot();
})();
