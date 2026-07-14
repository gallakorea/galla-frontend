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
    if (confirm("로그인이 필요합니다. 로그인하시겠어요?")) location.href = "login.html";
    return true;
  }

  /* ================= 갈라뉴스 ================= */
  async function loadGallaNews(id) {
    NEWS_ID = id;
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
        <div class="reader-src-thumb">${isValidThumbnail(s.thumbnail_url) ? `<img src="${esc(s.thumbnail_url)}" loading="lazy" onerror="galla_imgFail(this)">` : ""}</div>
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
        ${isValidThumbnail(n.hero_image) ? `<img class="reader-hero" src="${esc(n.hero_image)}" onerror="this.style.display='none'">` : ""}
        ${bodyParas.map((p) => `<p>${esc(p)}</p>`).join("")}
        <div class="gn-actions" id="gn-actions"></div>
        ${srcHtml ? `<div class="reader-sources"><div class="reader-sources-head">🔗 관련 기사 (출처 · 팩트체크)</div>${srcHtml}</div>` : ""}
        <p class="reader-disclaimer">본 기사는 위 보도들을 AI가 종합·재작성한 것입니다. 사진·사실의 출처는 각 언론사에 있습니다.</p>
        <div id="gn-comments" class="gn-comments"></div>
      </article>`;

    renderGnActions();
    loadGnComments(id);
  }

  /* ===== 액션바 (좋아요/싫어요/댓글/저장/공유) ===== */
  const GN_BM_ICON = '<svg class="ic-bookmark" viewBox="0 0 24 24"><path d="M17 21L12 17.25L7 21V5C7 3.89543 7.89543 3 9 3H15C16.1046 3 17 3.89543 17 5V21Z"/></svg>';
  const GN_SHARE_ICON = '<svg class="ic-share" viewBox="0 0 24 24"><path d="M22 3L11 14"/><path d="M22 3L15 21L11 14L2 10L22 3Z"/></svg>';

  function renderGnActions() {
    const bar = $("#gn-actions");
    if (!bar || !NEWS) return;
    const n = NEWS;
    bar.innerHTML = `
      <button class="gn-act ${n.myReact === 1 ? "on like" : ""}" data-act="like">👍 <span>${n.likes}</span></button>
      <button class="gn-act ${n.myReact === -1 ? "on dislike" : ""}" data-act="dislike">👎 <span>${n.dislikes}</span></button>
      <button class="gn-act" data-act="comment">💬 <span>${n.cCount}</span></button>
      <button class="gn-act gn-icon ${n.saved ? "on save" : ""}" data-act="save" aria-label="저장">${GN_BM_ICON}</button>
      <button class="gn-act gn-icon" data-act="share" aria-label="공유">${GN_SHARE_ICON}</button>`;
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
    const url = new URL(`news.html?gn=${NEWS_ID}`, location.href).href;
    if (navigator.share) {
      try { await navigator.share({ title: NEWS.title || "GALLA 뉴스", url }); return; }
      catch (err) { if (err.name === "AbortError") return; }
    }
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
    const { data } = await supabase.from("user_profiles").select("user_id,nickname").in("user_id", uniq);
    const m = {}; (data || []).forEach((p) => (m[p.user_id] = p));
    return m;
  }
  const cmtBody = (c) => esc(c).replace(/@(\S+)/g, '<span class="gnc-mention">@$1</span>');

  let GNC = null, GNC_NEWS = null, GNC_TOP_LIMIT = 8;
  const GNC_EXPANDED = new Set();

  async function loadGnComments(newsId) {
    GNC_NEWS = newsId; GNC_TOP_LIMIT = 8; GNC_EXPANDED.clear();
    const { data: rows } = await supabase.from("galla_news_comments")
      .select("id,user_id,content,created_at,parent_id").eq("news_id", newsId)
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
      return `<div class="gnc ${isReply ? "reply" : ""}" data-cmt-item data-id="${c.id}" data-top="${topId}" data-author="${esc(nick(c.user_id))}">
        <div class="gnc-av">${esc(nick(c.user_id).trim().charAt(0) || "익")}</div>
        <div class="gnc-main">
          <div class="gnc-head"><span class="gnc-name">${esc(nick(c.user_id))}</span><span class="gnc-time">${timeAgo(c.created_at)}</span>${cmtMenu}</div>
          <div class="gnc-text" data-cmt-text>${cmtBody(c.content)}</div>
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
      <div class="gnc-title">💬 댓글 ${total}</div>
      <div class="gnc-compose">
        <input id="gncInput" class="gnc-input" maxlength="300" placeholder="의견을 남기고 붙어보세요…">
        <button id="gncSend" class="gnc-send">게시</button>
      </div>
      <div class="gnc-list">${tops.length ? shown.map(thread).join("") : '<div class="gnc-empty">첫 댓글을 남겨보세요!</div>'}</div>
      ${remaining > 0 ? `<button id="gncMore" class="gnc-more">댓글 더 보기 (${remaining})</button>` : ""}`;

    const inp = $("#gncInput");
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
    const { error } = await supabase.from("galla_news_comments")
      .insert({ news_id: GNC_NEWS, user_id: ME.id, content, parent_id: parentId || null });
    if (error) { alert("댓글 등록 실패"); return; }
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
  document.addEventListener("DOMContentLoaded", async () => {
    supabase = await waitForSupabaseClient();
    const { data } = await supabase.auth.getUser();
    ME = data?.user || null;

    const qs = new URLSearchParams(location.search);
    const gn = qs.get("gn");
    const url = qs.get("url");

    if (gn) {
      $("#np-ext").style.display = "none";
      await loadGallaNews(gn);
    } else if (url) {
      await loadArticle(url, qs.get("title") || "", qs.get("press") || "");
    } else {
      readerEl().innerHTML = `<div class="reader-loading">기사를 찾을 수 없어요.</div>`;
    }
  });
})();
