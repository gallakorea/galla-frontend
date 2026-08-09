/* =========================================================
   news-page.js — 뉴스 상세 '페이지' (news.html)
   ?gn=<id>                       → 갈라뉴스(AI 종합) 리더
   ?url=<원문>&title=&press=      → 원본 기사 리더(article-reader 엣지 함수)

   ⚠️ 예전엔 검색 페이지 위의 모달이었다. 모달을 pushState로 페이지 흉내내면
      사파리 스와이프 뒤로가기가 목록을 스치고 이전 문서까지 튕겨 나간다.
      그래서 진짜 페이지로 분리했다. 뒤로가기는 브라우저가 알아서 해준다.
========================================================= */
(function () {
  const $ = (s) => document.querySelector(s);

  const esc = (s) => (s == null ? "" : String(s))
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const timeAgo = (ts) => {
    if (!ts) return "";
    const d = (Date.now() - new Date(ts)) / 1000;
    if (d < 60) return "방금";
    if (d < 3600) return `${Math.floor(d / 60)}분 전`;
    if (d < 86400) return `${Math.floor(d / 3600)}시간 전`;
    return `${Math.floor(d / 86400)}일 전`;
  };

  const fmtDate = (ts) => {
    const d = ts ? new Date(ts) : null;
    return d && !isNaN(d) ? d.toLocaleDateString("ko-KR") : "";
  };

  function isValidThumbnail(url) {
    if (!url || typeof url !== "string") return false;
    const u = url.trim();
    return !!u && u !== "about:blank" && u.startsWith("http");
  }
  window.galla_imgFail = function (el) {
    el.style.display = "none";
    const box = el.closest(".news-thumb-16x9, .sr-thumb, .news-mini-thumb, .reader-src-thumb");
    if (box) box.classList.add("thumb-fail");
  };

  let supabase = null, ME = null;
  let NEWS = null;          // 현재 갈라뉴스 레코드
  let NEWS_ID = null;

  const titleEl = () => $("#np-title");
  const readerEl = () => $("#np-reader");
  const fallbackEl = () => $("#np-fallback");

  function needLogin() {
    if (ME) return false;
    if (confirm("로그인이 필요합니다. 로그인하시겠어요?")) (window.GALLA_nav||function(u){location.href=u})("login.html");
    return true;
  }

  /* 조회수 — 세션당 기사 1회만 증가 (새로고침·재방문 중복 방지) */
  function bumpViewOnce(id) {
    try {
      const key = "gn_viewed";
      const seen = JSON.parse(sessionStorage.getItem(key) || "[]");
      if (seen.includes(id)) return;
      seen.push(id);
      sessionStorage.setItem(key, JSON.stringify(seen.slice(-200)));
      supabase.rpc("bump_news_view", { p_id: id });   // 실패해도 무시
    } catch (_) {}
  }

  /* ================= 갈라뉴스 ================= */
  async function loadGallaNews(id) {
    NEWS_ID = id;
    bumpViewOnce(id);
    const { data: n } = await supabase.from("galla_news")
      .select("id,title,summary,body,category,hero_image,source_count,published_at")
      .eq("id", id).maybeSingle();
    if (!n) {
      readerEl().innerHTML = `<div class="reader-loading">기사를 찾을 수 없어요.</div>`;
      return;
    }

    // 참여 집계
    const [{ count: cCount }, { data: rx }] = await Promise.all([
      supabase.from("galla_news_comments").select("id", { count: "exact", head: true }).eq("news_id", id),
      supabase.from("galla_news_reactions").select("value").eq("news_id", id),
    ]);
    n.likes = (rx || []).filter((r) => r.value === 1).length;
    n.dislikes = (rx || []).filter((r) => r.value === -1).length;
    n.cCount = cCount || 0;
    n.myReact = 0; n.saved = false;
    if (ME) {
      const [{ data: mine }, { data: bm }] = await Promise.all([
        supabase.from("galla_news_reactions").select("value").eq("news_id", id).eq("user_id", ME.id).maybeSingle(),
        supabase.from("galla_news_bookmarks").select("news_id").eq("news_id", id).eq("user_id", ME.id).maybeSingle(),
      ]);
      n.myReact = mine?.value || 0;
      n.saved = !!bm;
    }
    NEWS = n;

    document.title = `${n.title} · GALLA 뉴스`;
    titleEl().textContent = n.title || "갈라뉴스";

    const { data: srcs } = await supabase.from("galla_news_sources")
      .select("url,press_name,title,thumbnail_url").eq("news_id", id);

    const bodyParas = (n.body || "").split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);

    const srcHtml = (srcs || []).map((s) => `
      <a class="reader-src" href="${esc(s.url || "#")}" target="_blank" rel="noopener noreferrer">
        <div class="reader-src-thumb">${isValidThumbnail(s.thumbnail_url) ? `<img src="${esc(s.thumbnail_url)}" referrerpolicy="no-referrer" loading="lazy" onerror="galla_imgFail(this)">` : ""}</div>
        <div class="reader-src-body">
          <div class="reader-src-title">${esc(s.title || "")}</div>
          <div class="reader-src-press">${esc(s.press_name || "")} ↗</div>
        </div>
      </a>`).join("");

    readerEl().innerHTML = `
      <article class="reader">
        <span class="reader-badge">갈라뉴스 · AI 종합</span>
        <h1 class="reader-title">${esc(n.title)}</h1>
        <div class="reader-sub">${esc(n.category || "")} · ${timeAgo(n.published_at)}</div>
        ${isValidThumbnail(n.hero_image) ? `<img class="reader-hero" src="${esc(n.hero_image)}" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ""}
        ${bodyParas.map((p) => `<p>${esc(p)}</p>`).join("")}
        <div class="gn-actions" id="gn-actions"></div>
        ${srcHtml ? `<div class="reader-sources"><div class="reader-sources-head">🔗 관련 기사 (출처 · 팩트체크)</div>${srcHtml}</div>` : ""}
        <p class="reader-disclaimer">본 기사는 위 보도들을 AI가 종합·재작성한 것입니다. 사진·사실의 출처는 각 언론사에 있습니다.</p>
        <div id="gn-comments" class="gn-comments"></div>
      </article>`;

    renderGnActions();
    loadGnComments(id);
  }

  /* ===== 액션바 (좋아요/싫어요/댓글/저장/공유) =====
     이모지는 기기마다 크기·모양이 달라 줄 정렬이 흔들린다 → 전부 SVG 통일. */
  const gnSvg = (cls, d) =>
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

  const GN_LIKE_ICON = gnSvg("ic-like",
    '<path d="M7 10.5V21H4a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1h3z"/><path d="M7 10.5l4.2-7.4a1 1 0 0 1 1.4-.4l.6.4a2.4 2.4 0 0 1 1 2.6L13.5 9h5.3a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17.4 20H7"/>');
  const GN_DISLIKE_ICON = gnSvg("ic-dislike",
    '<path d="M17 13.5V3h3a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1h-3z"/><path d="M17 13.5l-4.2 7.4a1 1 0 0 1-1.4.4l-.6-.4a2.4 2.4 0 0 1-1-2.6l.7-3.3H5.2a2 2 0 0 1-2-2.4l1.4-7A2 2 0 0 1 6.6 4H17"/>');
  const GN_CMT_ICON = gnSvg("ic-comment",
    '<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.6 8.6 0 0 1-3.9-.9L3.5 20.5l1.4-5.1a8.4 8.4 0 0 1-.9-3.9A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z"/>');
  const GN_BM_ICON = gnSvg("ic-bookmark",
    '<path d="M18 21l-6-4.3L6 21V5.5A2.5 2.5 0 0 1 8.5 3h7A2.5 2.5 0 0 1 18 5.5V21z"/>');
  const GN_SHARE_ICON = gnSvg("ic-share",
    '<path d="M21.5 2.5L10.8 13.2"/><path d="M21.5 2.5l-6.8 19-3.9-8.3-8.3-3.9 19-6.8z"/>');

  function renderGnActions() {
    const bar = $("#gn-actions");
    if (!bar || !NEWS) return;
    const n = NEWS;
    bar.innerHTML = `
      <button class="gn-act ${n.myReact === 1 ? "on like" : ""}" data-act="like">${GN_LIKE_ICON} <span>${n.likes}</span></button>
      <button class="gn-act ${n.myReact === -1 ? "on dislike" : ""}" data-act="dislike">${GN_DISLIKE_ICON} <span>${n.dislikes}</span></button>
      <button class="gn-act" data-act="comment">${GN_CMT_ICON} <span>${n.cCount}</span></button>
      <button class="gn-act gn-icon ${n.saved ? "on save" : ""}" data-act="save" aria-label="저장">${GN_BM_ICON}</button>
      <button class="gn-act gn-icon" data-act="share" aria-label="공유">${GN_SHARE_ICON}</button>
      <button class="gn-act gn-icon" data-galvis data-gv-type="news" data-gv-id="${n.id || ""}" data-gv-title="${String(n.title || "").replace(/"/g, "&quot;").slice(0, 120)}" aria-label="갈비스와 얘기"><svg class="gv-galvis" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="8.2" stroke-dasharray="2.3 2.2"/><circle cx="12" cy="12" r="4.7" stroke-width="1.3"/><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/></svg></button>`;
    bar.querySelectorAll(".gn-act").forEach((b) => b.addEventListener("click", () => {
      const act = b.dataset.act;
      if (act === "like") reactGn(1);
      else if (act === "dislike") reactGn(-1);
      else if (act === "save") saveGn();
      else if (act === "share") shareGn();
      else if (act === "comment") $("#gn-comments")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }

  async function shareGn() {
    if (!NEWS) return;
    // OG 카드 URL(/share/…)로 우리 공유 시트 — 네이티브 시트(navigator.share) 대신 GALLA 시트
    const url = new URL(`/share/news/${NEWS_ID}`, location.href).href;
    if (window.GALLA_share) { window.GALLA_share({ url, title: NEWS.title || "GALLA 뉴스" }); return; }
    try { await navigator.clipboard.writeText(url); alert("링크가 복사되었습니다."); }
    catch { alert("링크 복사에 실패했습니다."); }
  }

  async function reactGn(val) {
    if (needLogin() || !NEWS) return;
    const n = NEWS;
    const cur = n.myReact || 0;
    if (cur === val) {
      await supabase.from("galla_news_reactions").delete().eq("news_id", NEWS_ID).eq("user_id", ME.id);
      if (val === 1) n.likes--; else n.dislikes--;
      n.myReact = 0;
    } else {
      await supabase.from("galla_news_reactions")
        .upsert({ news_id: NEWS_ID, user_id: ME.id, value: val }, { onConflict: "news_id,user_id" });
      if (cur === 1) n.likes--; else if (cur === -1) n.dislikes--;
      if (val === 1) n.likes++; else n.dislikes++;
      n.myReact = val;
    }
    renderGnActions();
  }

  async function saveGn() {
    if (needLogin() || !NEWS) return;
    if (NEWS.saved) {
      await supabase.from("galla_news_bookmarks").delete().eq("news_id", NEWS_ID).eq("user_id", ME.id);
      NEWS.saved = false;
    } else {
      await supabase.from("galla_news_bookmarks").insert({ news_id: NEWS_ID, user_id: ME.id });
      NEWS.saved = true;
    }
    renderGnActions();
  }

  /* ===== 배틀 댓글 (대댓글 + @멘션 + 좋아요) ===== */
  async function fetchProfiles(ids) {
    const uniq = [...new Set(ids.filter(Boolean))];
    if (!uniq.length) return {};
    // 정본 users에서 아바타·레벨까지 (GALLA_userBadge 캐시도 같이 채움)
    if (window.GALLA_userMap) await window.GALLA_userMap(uniq);
    const { data } = await supabase.from("users").select("id,nickname,level,avatar_url").in("id", uniq);
    const m = {}; (data || []).forEach((p) => (m[p.id] = p));
    return m;
  }
  const cmtBody = (c) => esc(c).replace(/@(\S+)/g, '<span class="gnc-mention">@$1</span>');

  let GNC = null, GNC_NEWS = null, GNC_TOP_LIMIT = 8;
  const GNC_EXPANDED = new Set();

  async function loadGnComments(newsId) {
    GNC_NEWS = newsId; GNC_TOP_LIMIT = 8; GNC_EXPANDED.clear();
    const { data: rows } = await supabase.from("galla_news_comments")
      .select("id,user_id:author_id,content,created_at,parent_id,is_anonymous,ghost_seed,locale").eq("news_id", newsId)
      .order("created_at", { ascending: true }).limit(500);
    const profs = await fetchProfiles((rows || []).map((c) => c.user_id));
    const ids = (rows || []).map((c) => c.id);
    const likeAgg = {}; const myLikes = new Set();
    if (ids.length) {
      const { data: likes } = await supabase.from("galla_news_comment_likes")
        .select("comment_id,user_id").in("comment_id", ids);
      likes?.forEach((l) => {
        likeAgg[l.comment_id] = (likeAgg[l.comment_id] || 0) + 1;
        if (ME && l.user_id === ME.id) myLikes.add(l.comment_id);
      });
    }
    const tops = (rows || []).filter((c) => !c.parent_id).reverse();
    const childrenOf = {};
    (rows || []).forEach((c) => { if (c.parent_id) (childrenOf[c.parent_id] ||= []).push(c); });
    Object.values(childrenOf).forEach((a) => a.sort((x, y) => new Date(x.created_at) - new Date(y.created_at)));
    GNC = { tops, childrenOf, profs, likeAgg, myLikes };
    renderGnComments();
  }

  function renderGnComments() {
    const box = $("#gn-comments");
    if (!box || !GNC) return;
    const { tops, childrenOf, profs, likeAgg, myLikes } = GNC;
    const nick = (uid) => profs[uid]?.nickname || "익명";
    const total = tops.length + Object.values(childrenOf).reduce((a, b) => a + b.length, 0);

    const cmt = (c, isReply, topId) => {
      const liked = myLikes.has(c.id);
      const mine = c.user_id && ME && c.user_id === ME.id;
      const cmtMenu = mine
        ? `<button class="cmt-mini" data-cmt-menu data-cmt-table="galla_news_comments" data-cmt-id="${c.id}" data-cmt-uid="${c.user_id}" data-cmt-bodycol="content" aria-label="더보기">⋯</button>`
        : "";
      // 👻 유령 댓글: 고정 페르소나 이름·아바타, 프로필 이동 차단(ghost.js)
      const g = c.is_anonymous && window.GALLA_ghost ? window.GALLA_ghost(c.ghost_seed) : null;
      const prof = profs[c.user_id] || {};
      const avHtml = g ? `<span class="gnc-av ghost-nick" style="padding:0;background:none">${g.avatarHTML}</span>`
        : (prof.avatar_url
          ? `<img class="gnc-av" src="${esc(window.GALLA_avatarSrc ? window.GALLA_avatarSrc(prof.avatar_url) : prof.avatar_url)}" alt="" style="object-fit:cover" data-user-id="${c.user_id}" data-user-nick="${esc(nick(c.user_id))}">`
          : `<div class="gnc-av" data-user-id="${c.user_id}" data-user-nick="${esc(nick(c.user_id))}">${esc(nick(c.user_id).trim().charAt(0) || "익")}</div>`);
      const nameHtml = g ? `<span class="gnc-name ghost-nick" style="color:${g.color}">${g.name}</span>`
        : `<span class="gnc-name" data-user-id="${c.user_id}" data-nick-uid="${c.user_id}" data-user-nick="${esc(nick(c.user_id))}" style="cursor:pointer">${esc(nick(c.user_id))}</span>`;
      return `<div class="gnc ${isReply ? "reply" : ""}" data-cmt-item data-id="${c.id}" data-top="${topId}" data-author="${esc(g ? g.name : nick(c.user_id))}">
        ${avHtml}
        <div class="gnc-main">
          <div class="gnc-head">${nameHtml}<span class="gnc-time">${timeAgo(c.created_at)}</span>${cmtMenu}</div>
          <div class="gnc-text" data-cmt-text data-cmt-kind="news" data-cmt-id="${c.id}" data-cmt-locale="${c.locale || "ko"}">${cmtBody(c.content)}</div>
          <div class="gnc-actions">
            <button class="gnc-like ${liked ? "on" : ""}" data-id="${c.id}">♥ <span>${likeAgg[c.id] || 0}</span></button>
            <button class="gnc-reply" data-id="${c.id}">답글</button>
          </div>
        </div>
      </div>`;
    };
    const thread = (c) => {
      const kids = childrenOf[c.id] || [];
      const exp = GNC_EXPANDED.has(c.id);
      let rep = "";
      if (kids.length) {
        rep = exp
          ? `<div class="gnc-replies">${kids.map((k) => cmt(k, true, c.id)).join("")}</div><button class="gnc-toggle" data-top="${c.id}" data-act="collapse">답글 숨기기 ▴</button>`
          : `<button class="gnc-toggle" data-top="${c.id}" data-act="expand">${kids.length}개 답글 보기 ▾</button>`;
      }
      return `<div class="gnc-thread">${cmt(c, false, c.id)}${rep}<div class="gnc-rb" id="gnc-rb-${c.id}" hidden></div></div>`;
    };
    const shown = tops.slice(0, GNC_TOP_LIMIT);
    const remaining = tops.length - shown.length;

    box.innerHTML = `
      <div class="gnc-title">${GN_CMT_ICON} 댓글 ${total}</div>
      <div class="gnc-compose">
        <input id="gncInput" class="gnc-input" maxlength="300" placeholder="의견을 남기고 붙어보세요…">
        <button type="button" class="ghost-toggle sm" id="gnc-ghost" title="유령으로 활동"><span class="gt-ic">👻</span></button>
        <button id="gncSend" class="gnc-send">게시</button>
      </div>
      <div class="gnc-list">${tops.length ? shown.map(thread).join("") : '<div class="gnc-empty">첫 댓글을 남겨보세요!</div>'}</div>
      ${remaining > 0 ? `<button id="gncMore" class="gnc-more">댓글 더 보기 (${remaining})</button>` : ""}`;

    const inp = $("#gncInput");
    window.GALLA_ghostBind && window.GALLA_ghostBind(document.getElementById("gnc-ghost"));
    $("#gncSend").addEventListener("click", () => postGnComment(inp.value, null));
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") postGnComment(inp.value, null); });
    $("#gncMore")?.addEventListener("click", () => { GNC_TOP_LIMIT += 10; renderGnComments(); });

    box.querySelectorAll(".gnc-toggle").forEach((b) => b.addEventListener("click", () => {
      const id = Number(b.dataset.top);
      if (b.dataset.act === "expand") GNC_EXPANDED.add(id); else GNC_EXPANDED.delete(id);
      renderGnComments();
    }));
    box.querySelectorAll(".gnc-like").forEach((b) => b.addEventListener("click", async () => {
      if (needLogin()) return;
      const id = Number(b.dataset.id), on = b.classList.contains("on");
      const span = b.querySelector("span"), n = Number(span.textContent);
      if (on) {
        await supabase.from("galla_news_comment_likes").delete().eq("comment_id", id).eq("user_id", ME.id);
        b.classList.remove("on"); span.textContent = Math.max(0, n - 1);
        GNC.myLikes.delete(id); GNC.likeAgg[id] = (GNC.likeAgg[id] || 1) - 1;
      } else {
        const { error } = await supabase.from("galla_news_comment_likes").insert({ comment_id: id, user_id: ME.id });
        if (!error) {
          b.classList.add("on"); span.textContent = n + 1;
          GNC.myLikes.add(id); GNC.likeAgg[id] = (GNC.likeAgg[id] || 0) + 1;
        }
      }
    }));
    box.querySelectorAll(".gnc-reply").forEach((b) => b.addEventListener("click", () => {
      if (needLogin()) return;
      const el = b.closest(".gnc"), topId = Number(el.dataset.top), author = el.dataset.author;
      GNC_EXPANDED.add(topId);
      if (!document.getElementById("gnc-rb-" + topId)) renderGnComments();
      const rb = document.getElementById("gnc-rb-" + topId);
      rb.hidden = false;
      rb.innerHTML = `<div class="gnc-compose reply"><input class="gnc-input gnc-reply-input" maxlength="300" value="@${esc(author)} "><button class="gnc-send gnc-reply-send">게시</button></div>`;
      const ri = rb.querySelector(".gnc-reply-input");
      ri.focus(); ri.setSelectionRange(ri.value.length, ri.value.length);
      rb.querySelector(".gnc-reply-send").addEventListener("click", () => postGnComment(ri.value, topId));
      ri.addEventListener("keydown", (e) => { if (e.key === "Enter") postGnComment(ri.value, topId); });
    }));
  }

  async function postGnComment(content, parentId) {
    if (needLogin()) return;
    content = (content || "").trim();
    if (!content) return;
    const ghostBtn = document.getElementById("gnc-ghost");
    const { error } = await supabase.from("galla_news_comments")
      .insert({ news_id: GNC_NEWS, user_id: ME.id, content, parent_id: parentId || null,
                is_anonymous: ghostBtn?.classList.contains("on") === true });
    if (error) {
      if (window.GALLA_ghostInsertError && window.GALLA_ghostInsertError(error, ghostBtn)) return;
      alert("댓글 등록 실패"); return;
    }
    window.GALLA_toast && GALLA_toast(parentId ? "💬 답글이 등록됐어요" : "💬 댓글이 등록됐어요");
    if (parentId) GNC_EXPANDED.add(parentId);
    await loadGnComments(GNC_NEWS);
  }

  /* ================= 원본 기사 ================= */
  async function loadArticle(url, title, press) {
    document.title = `${title || "기사"} · GALLA`;
    titleEl().textContent = title || press || "기사";
    $("#np-ext").href = url;
    $("#np-fallback-btn").href = url;
    $("#np-fallback .nvf-title").textContent = title || "";
    $("#np-ext").style.display = "";

    let d = null;
    try {
      const res = await supabase.functions.invoke("article-reader", { body: { url } });
      d = res.data;
    } catch (_) { /* 폴백으로 넘어간다 */ }

    if (d && d.ok && Array.isArray(d.blocks) && d.blocks.length) {
      const imgCount = d.blocks.filter((b) => b.t === "img").length;
      // 본문에 사진이 없을 때만 대표(og) 이미지를 상단에 (중복 방지)
      const hero = (isValidThumbnail(d.image) && imgCount === 0)
        ? `<img class="reader-hero" src="${esc(d.image)}" onerror="this.style.display='none'">` : "";
      const body = d.blocks.map((b) => b.t === "img"
        ? `<img class="reader-img" src="${esc(b.src)}" loading="lazy" onerror="this.remove()">`
        : `<p>${esc(b.text)}</p>`).join("");
      readerEl().innerHTML = `
        <article class="reader">
          <h1 class="reader-title">${esc(d.title || title || "")}</h1>
          <div class="reader-sub">${esc(d.siteName || press || "")}${d.published && fmtDate(d.published) ? " · " + fmtDate(d.published) : ""}</div>
          ${hero}
          ${body}
          <a class="reader-origin" href="${esc(url)}" target="_blank" rel="noopener noreferrer">원문 기사에서 보기 ↗</a>
        </article>`;
    } else {
      readerEl().hidden = true;
      fallbackEl().hidden = false;
    }
  }

  /* ================= 시작 ================= */
  /* 🔀 이중 모드 — MPA(단독 news.html)면 DCL로 location.search 읽어 자동 실행,
     SPA(app.html)면 어댑터(js/spa/views/news.js)가 GALLA_PAGE_NEWS.mount(root, params)로 부른다.
     params: { gn } 또는 { url, title, press }. (IDs가 고유해 전역 $로도 뷰 격리됨) */
  async function boot(p) {
    supabase = await waitForSupabaseClient();
    const { data } = await supabase.auth.getUser();
    ME = data?.user || null;
    const gn = p && p.gn, url = p && p.url;
    if (gn) {
      const ext = $("#np-ext"); if (ext) ext.style.display = "none";
      await loadGallaNews(gn);
    } else if (url) {
      await loadArticle(url, (p && p.title) || "", (p && p.press) || "");
    } else {
      readerEl().innerHTML = `<div class="reader-loading">기사를 찾을 수 없어요.</div>`;
    }
  }
  window.GALLA_PAGE_NEWS = { mount: async (_root, params) => { await boot(params || {}); } };

  document.addEventListener("DOMContentLoaded", () => {
    if (document.body && document.body.dataset.page === "spa") return;   // SPA는 어댑터가 mount
    const qs = new URLSearchParams(location.search);
    boot({ gn: qs.get("gn"), url: qs.get("url"), title: qs.get("title"), press: qs.get("press") });
  });
})();
