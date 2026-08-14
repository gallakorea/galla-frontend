/* =========================================================
   hot-videos.js — 검색 > 🎬 핫영상 (유튜브 인기 급상승)
   - youtube_hot(피드별, 30분 크론 수집)을 카테고리로 나눠 렌더
   - 롱폼 / 쇼츠 분리 (is_short)
   - '전체'는 히어로 + TOP10 + 카테고리별 가로 선반(넷플릭스식)
   - 재생은 공식 유튜브 iframe (우리가 호스팅하지 않음 = ToS 준수)
   - 플레이어: 좋아요 · 댓글(대댓글·댓글좋아요) · 공유(갈라 랜딩)
   - window.GALLA_HotShelf(el, n) 로 핫트렌드 탭에서도 재사용
========================================================= */
(function () {
  // 방송 카테고리 — 라벨/아이콘은 여기서만 관리.
  // 편수가 얇던 분류(영화·코믹·스포츠·여행·취미·경제·교육)는 큰 축에 통폐합했다.
  // (수집기 FEEDS와 id가 1:1로 맞아야 한다)
  const CATS = [
    { id: "all",    label: "전체",         emoji: "🔥" },
    { id: "ent",    label: "예능·드라마",   emoji: "🎭" },
    { id: "food",   label: "맛집·먹방",     emoji: "🍜" },
    { id: "game",   label: "게임·스포츠",   emoji: "🎮" },
    { id: "travel", label: "여행",         emoji: "✈️" },
    { id: "news",   label: "뉴스·시사",     emoji: "📰" },
    { id: "tech",   label: "IT·과학",      emoji: "💻" },
    { id: "music",  label: "음악",         emoji: "🎵" },
    { id: "beauty", label: "뷰티·패션",     emoji: "💄" },
    { id: "animal", label: "동물",         emoji: "🐾" },
    { id: "life",   label: "일상·취미",     emoji: "🏠" },
  ];
  // '전체' 화면에 선반으로 깔 카테고리 순서 — 편수 많은 축을 위로(빈 선반이 먼저 보이지 않게)
  const SHELVES = ["ent", "food", "game", "travel", "news",
                   "tech", "music", "beauty", "animal", "life"];

  const cache = new Map();      // feed → rows (롱폼+쇼츠 전부)
  let current = "all";
  let mode = "long";            // 'long' | 'short'
  let booted = false;

  const $ = (s, r = document) => r.querySelector(s);
  const label = (id) => CATS.find((c) => c.id === id) || { label: id, emoji: "🎬" };

  const esc = (s) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /* 카드 통계 아이콘 — 이모지(👍)는 기기마다 크기·모양이 달라 줄 정렬이 흔들린다.
     다른 페이지와 같은 규약(stroke 1.8 · currentColor)의 SVG로 통일. */
  const HV_LIKE_ICON =
    `<svg class="hv-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
       <path d="M7 10.5V21H4a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1h3z"/>
       <path d="M7 10.5l4.2-7.4a1 1 0 0 1 1.4-.4l.6.4a2.4 2.4 0 0 1 1 2.6L13.5 9h5.3a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17.4 20H7"/>
     </svg>`;

  function shortNum(n) {
    n = Number(n) || 0;
    if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, "") + "억";
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "만";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "천";
    return String(n);
  }

  function dur(iso) {
    const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
    if (!m) return "";
    const h = +(m[1] || 0), mi = +(m[2] || 0), s = +(m[3] || 0);
    const p = (x) => String(x).padStart(2, "0");
    return h ? `${h}:${p(mi)}:${p(s)}` : `${mi}:${p(s)}`;
  }

  function timeAgo(iso) {
    if (!iso) return "";
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 3600) return Math.max(1, Math.floor(d / 60)) + "분 전";
    if (d < 86400) return Math.floor(d / 3600) + "시간 전";
    if (d < 604800) return Math.floor(d / 86400) + "일 전";
    return Math.floor(d / 604800) + "주 전";
  }

  async function sb() {
    return window.supabaseClient ||
      (window.waitForSupabaseClient ? await window.waitForSupabaseClient() : null);
  }

  async function loadFeed(feed) {
    if (cache.has(feed)) return cache.get(feed);
    const c = await sb();
    if (!c) return [];
    const { data, error } = await (window.GALLA_lfilter||function(q){return q;})(c
      .from("youtube_hot")
      .select("video_id,title,channel_title,thumbnail,view_count,like_count,duration,is_short,published_at,rank")
      .eq("feed", feed)
      // 🚫 '- Topic' 자동생성 음원 채널은 유튜브가 임베드를 원천 차단(오류 153) → 애초에 제외
      .not("channel_title", "ilike", "%- Topic")
      .order("rank", { ascending: true })
      .limit(60));
    const rows = error ? [] : (data || []);
    cache.set(feed, rows);
    return rows;
  }

  // 현재 모드(롱폼/쇼츠)에 맞는 것만. 순위는 모드 안에서 다시 매긴다.
  const pick = (rows) =>
    rows.filter((v) => (mode === "short" ? v.is_short : !v.is_short))
        .map((v, i) => ({ ...v, rank: i + 1 }));

  // '전체 + 쇼츠'는 feed='all'(유튜브 종합 인기차트)에 쇼츠가 거의 없다.
  // 그래서 모든 카테고리의 쇼츠를 모아 조회수 순으로 보여준다.
  async function loadAllShorts() {
    if (cache.has("__shorts")) return cache.get("__shorts");
    const c = await sb();
    if (!c) return [];
    const { data, error } = await (window.GALLA_lfilter||function(q){return q;})(c
      .from("youtube_hot")
      .select("video_id,title,channel_title,thumbnail,view_count,like_count,duration,is_short,published_at")
      .eq("is_short", true)
      .not("channel_title", "ilike", "%- Topic")
      .order("view_count", { ascending: false })
      .limit(200));
    const seen = new Set();
    const rows = (error ? [] : (data || []))
      .filter((v) => !seen.has(v.video_id) && seen.add(v.video_id))   // 피드별로 중복 저장됨
      .slice(0, 60)
      .map((v, i) => ({ ...v, rank: i + 1 }));
    cache.set("__shorts", rows);
    return rows;
  }

  /* ---------- 카드 템플릿 ---------- */
  const attrs = (v) =>
    `data-id="${esc(v.video_id)}" data-title="${esc(v.title)}" data-ch="${esc(v.channel_title || "")}"`;

  function heroHTML(v) {
    return `
      <button type="button" class="hv-hero" ${attrs(v)}>
        <img src="${esc(v.thumbnail || "")}" alt="">
        <span class="hv-hero-sh"></span>
        <span class="hv-hero-badge">🔥 지금 1위</span>
        <span class="hv-hero-play">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </span>
        <span class="hv-hero-tx">
          <span class="hv-hero-t">${esc(v.title)}</span>
          <span class="hv-hero-m">${esc(v.channel_title || "")} · 조회 ${shortNum(v.view_count)}</span>
        </span>
      </button>`;
  }

  // 가로 선반 타일 — 쇼츠는 9:16 세로
  function tileHTML(v) {
    const s = v.is_short;
    return `
      <button type="button" class="hv-tile${s ? " hv-tile-s" : ""}" ${attrs(v)}>
        <span class="hv-tile-th">
          <img src="${esc(v.thumbnail || "")}" alt="" loading="lazy">
          ${s ? `<span class="hv-sbadge">쇼츠</span>`
              : (v.duration ? `<span class="hv-dur">${dur(v.duration)}</span>` : "")}
        </span>
        <span class="hv-tile-t">${esc(v.title)}</span>
        <span class="hv-tile-m">조회 ${shortNum(v.view_count)}</span>
      </button>`;
  }

  // 쇼츠 그리드 셀 (세로 카드)
  function shortHTML(v) {
    return `
      <button type="button" class="hv-scell" ${attrs(v)}>
        <span class="hv-scell-th">
          <img src="${esc(v.thumbnail || "")}" alt="" loading="lazy">
          <span class="hv-rank">${v.rank}</span>
          <span class="hv-scell-v">▶ ${shortNum(v.view_count)}</span>
        </span>
        <span class="hv-scell-t">${esc(v.title)}</span>
        <span class="hv-scell-c">${esc(v.channel_title || "")}</span>
      </button>`;
  }

  // 롱폼 목록 카드 (가로)
  function rowHTML(v) {
    return `
      <button type="button" class="hv-card" ${attrs(v)}>
        <span class="hv-thumb">
          <img src="${esc(v.thumbnail || "")}" alt="" loading="lazy">
          <span class="hv-rank">${v.rank}</span>
          ${v.duration ? `<span class="hv-dur">${dur(v.duration)}</span>` : ""}
        </span>
        <span class="hv-meta">
          <span class="hv-t">${esc(v.title)}</span>
          <span class="hv-ch">${esc(v.channel_title || "")}</span>
          <span class="hv-stat">
            <span>조회 ${shortNum(v.view_count)}</span>
            <span class="hv-stat-i">${shortNum(v.like_count)} likes</span>
            <span>${timeAgo(v.published_at)}</span>
          </span>
        </span>
      </button>`;
  }

  function sectionHTML(title, sub, body, moreFeed) {
    return `
      <section class="hv-sec">
        <div class="hv-sec-h">
          <span class="hv-sec-t">${title}</span>
          ${sub ? `<span class="hv-sec-s">${sub}</span>` : ""}
          ${moreFeed ? `<button type="button" class="hv-more" data-goto="${moreFeed}">더보기
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
          </button>` : ""}
        </div>
        ${body}
      </section>`;
  }

  /* ---------- 렌더 ---------- */
  function renderChips() {
    const el = $("#hv-cats");
    if (!el) return;
    el.innerHTML = CATS.map(
      (c) => `<button type="button" class="hv-chip${c.id === current ? " on" : ""}" data-feed="${c.id}">
                <span class="hv-chip-e">${c.emoji}</span>${c.label}
              </button>`,
    ).join("");
    // scrollIntoView는 조상(페이지)까지 가로로 밀어버린다 → 컨테이너만 직접 옮긴다
    const on = el.querySelector(".hv-chip.on");
    if (on) el.scrollLeft = on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2;

    $$mode();
  }

  function $$mode() {
    document.querySelectorAll(".hv-mode-btn").forEach((b) => {
      b.classList.toggle("on", b.dataset.mode === mode);
    });
  }

  async function renderAll(el) {
    const rows = mode === "short" ? await loadAllShorts() : pick(await loadFeed("all"));
    if (!rows.length) {
      el.innerHTML = `<div class="hv-empty">${mode === "short" ? "쇼츠" : "롱폼"} 영상이 아직 없어요.</div>`;
      return;
    }

    if (mode === "short") {
      el.innerHTML = sectionHTML(
        "⚡ 급상승 쇼츠", `${rows.length}편`,
        `<div class="hv-sgrid">${rows.map(shortHTML).join("")}</div>`,
      ) + SHELVES.map((f) => `<div class="hv-shelf-slot" data-feed="${f}"></div>`).join("");
    } else {
      el.innerHTML =
        heroHTML(rows[0]) +
        sectionHTML("실시간 급상승", "TOP 10",
          `<div class="hv-list">${rows.slice(1, 11).map(rowHTML).join("")}</div>`) +
        SHELVES.map((f) => `<div class="hv-shelf-slot" data-feed="${f}"></div>`).join("");
    }

    // 카테고리 선반은 병렬로 채운다(첫 화면이 빨리 뜨도록)
    await Promise.all(SHELVES.map(async (f) => {
      const slot = el.querySelector(`.hv-shelf-slot[data-feed="${f}"]`);
      if (!slot) return;
      const list = pick(await loadFeed(f));
      if (!list.length) { slot.remove(); return; }
      const c = label(f);
      slot.outerHTML = sectionHTML(
        `${c.emoji} ${c.label}`, "",
        `<div class="hv-shelf">${list.slice(0, 12).map(tileHTML).join("")}</div>`,
        f,
      );
    }));
  }

  async function renderFeed(el, feed) {
    const rows = pick(await loadFeed(feed));
    const c = label(feed);
    if (!rows.length) {
      el.innerHTML = `<div class="hv-empty">${c.label}에 지금 뜨는 ${mode === "short" ? "쇼츠" : "롱폼"} 영상이 없어요.</div>`;
      return;
    }
    el.innerHTML = sectionHTML(
      `${c.emoji} ${c.label}`,
      `${mode === "short" ? "쇼츠" : "인기"} ${rows.length}편`,
      mode === "short"
        ? `<div class="hv-sgrid">${rows.map(shortHTML).join("")}</div>`
        : `<div class="hv-list">${rows.map(rowHTML).join("")}</div>`,
    );
  }

  async function render() {
    const el = $("#hot-video-list");
    if (!el) return;
    el.innerHTML = `<div class="hv-skel">${"<span></span>".repeat(5)}</div>`;
    renderChips();
    if (current === "all") await renderAll(el);
    else await renderFeed(el, current);
  }

  function goto(feed) {
    if (current === feed) return;
    current = feed;
    render();
  }

  function setMode(m) {
    if (mode === m) return;
    mode = m;
    render();
  }

  /* =======================================================
     플레이어 + 소셜
  ======================================================= */
  let vid = null, vtitle = "", liked = false, likeN = 0;

  async function loadSocial() {
    const c = await sb();
    if (!c || !vid) return;
    const { data } = await c.rpc("video_social", { p_ids: [vid] });
    const s = (data || [])[0] || { likes: 0, comments: 0, liked: false };
    liked = !!s.liked;
    likeN = Number(s.likes) || 0;
    paintLike();
    $("#hvCommentN").textContent = shortNum(s.comments);
  }

  function paintLike() {
    $("#hvLike").classList.toggle("on", liked);
    $("#hvLikeN").textContent = likeN ? `${shortNum(likeN)} 갈라 좋아요` : "갈라 좋아요";
  }

  async function me() {
    const c = await sb();
    const { data: { user } } = await c.auth.getUser();
    if (!user) { (window.GALLA_nav||function(u){location.href=u})("login.html"); return null; }
    return user;
  }

  async function toggleLike() {
    const user = await me();
    if (!user) return;
    const c = await sb();

    // 낙관적 갱신 — 실패하면 되돌린다
    const was = liked;
    liked = !liked;
    likeN += liked ? 1 : -1;
    paintLike();

    const { error } = liked
      ? await c.from("video_likes").insert({ video_id: vid, user_id: user.id })
      : await c.from("video_likes").delete().eq("video_id", vid).eq("user_id", user.id);
    if (error) {
      liked = was;
      likeN += liked ? 1 : -1;
      paintLike();
    }
  }

  /* ---------- 댓글 (대댓글 + 좋아요) ---------- */
  let replyTo = null;   // 답글 대상 댓글 id

  function cmtHTML(m, isReply) {
    // 👻 유령 댓글: 고정 페르소나 (RPC가 실명·아바타 마스킹, seed만 내려줌)
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
          <div class="hv-cmt-h">
            ${nameHtml}
            <span class="hv-cmt-d">${timeAgo(m.created_at)}</span>
          </div>
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
    const box = $("#hvCmtList");
    box.innerHTML = `<div class="hv-cmt-empty">불러오는 중…</div>`;
    const c = await sb();
    const { data, error } = await c.rpc("video_comment_list", { p_video_id: vid });
    if (error || !data?.length) {
      box.innerHTML = `<div class="hv-cmt-empty">첫 댓글을 남겨보세요.</div>`;
      $("#hvCommentN").textContent = "0";
      return;
    }
    // 레벨 배지용 프로필 캐시 프리페치 (유령 제외)
    if (window.GALLA_userMap) await window.GALLA_userMap(data.map((m) => m.user_id));
    // RPC가 스레드(최상위 → 그 답글들) 순서로 내려준다
    box.innerHTML = data.map((m) => cmtHTML(m, !!m.parent_id)).join("");
    $("#hvCommentN").textContent = shortNum(data.length);
  }

  function setReply(id, nick) {
    replyTo = id;
    const bar = $("#hvReplyTo");
    if (id) {
      bar.hidden = false;
      $("#hvReplyNick").textContent = nick;
      $("#hvCmtInput").focus();
    } else {
      bar.hidden = true;
    }
  }

  async function sendComment() {
    const inp = $("#hvCmtInput");
    const body = inp.value.trim();
    if (!body) return;
    const user = await me();
    if (!user) return;
    const c = await sb();

    inp.value = "";
    const ghostBtn = document.getElementById("hvGhost");
    const row = { video_id: vid, user_id: user.id, body,
      is_anonymous: ghostBtn?.classList.contains("on") === true };
    if (replyTo) row.parent_id = replyTo;
    const { error } = await c.from("video_comments").insert(row);
    if (error) {
      inp.value = body;
      if (window.GALLA_ghostInsertError) window.GALLA_ghostInsertError(error, ghostBtn);
      return;
    }
    window.GALLA_toast && GALLA_toast(replyTo ? "💬 답글이 등록됐어요" : "💬 댓글이 등록됐어요");
    setReply(null);
    loadComments();
  }

  async function toggleCmtLike(id, btn) {
    const user = await me();
    if (!user) return;
    const c = await sb();

    const on = btn.classList.toggle("on");
    const span = btn.querySelector("span");
    const n = (Number(span.textContent) || 0) + (on ? 1 : -1);
    span.textContent = n > 0 ? n : "";

    const { error } = on
      ? await c.from("video_comment_likes").insert({ comment_id: id, user_id: user.id })
      : await c.from("video_comment_likes").delete().eq("comment_id", id).eq("user_id", user.id);
    if (error) loadComments();   // 어긋나면 서버 기준으로 다시 그린다
  }

  async function delComment(id) {
    const c = await sb();
    await c.from("video_comments").delete().eq("id", id);
    loadComments();
  }

  /* ---------- 공유 — 갈라 랜딩으로 ---------- */
  async function share() {
    // 유튜브 링크가 아니라 우리 공유 카드/랜딩을 보낸다
    const url = `${location.origin}/share/video/${encodeURIComponent(vid)}`;
    const payload = {
      title: `🎬 ${vtitle}`,
      text: `지금 갈라에서 가장 뜨거운 영상 — ${vtitle}`,
      url,
    };
    // 🟦 커스텀 공유 시트 우선(네이티브 iOS 시트 대신 우리 브랜드 UI)
    if (window.GALLA_share) { window.GALLA_share(payload); return; }
    try {
      if (navigator.share) { await navigator.share(payload); return; }
      await navigator.clipboard.writeText(url);
      toast("갈라 공유 링크를 복사했어요");
    } catch (_) { /* 사용자가 공유를 취소 — 조용히 넘어간다 */ }
  }

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "hv-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  /* ---------- 플레이어 진입 ----------
     ⚠️ 재생 화면은 이제 '진짜 SPA 라우트 페이지'(watch.html · js/watch-page.js)가 담당한다.
        예전 오버레이(#hv-player)를 폐기하고, 카드 탭 → GALLA_nav('watch.html?v=..') 로 라우터에
        push → 슬라이드인·엣지 스와이프 백·pop 이 전부 라우터 스택으로 관리된다(사장님: "느낌 말고 SPA로"). */
  function openPlayer(id, title, ch) {
    if (!id) return;
    const u = `watch.html?v=${encodeURIComponent(id)}`
      + (title ? `&t=${encodeURIComponent(title)}` : "")
      + (ch ? `&c=${encodeURIComponent(ch)}` : "");
    (window.GALLA_nav || function (x) { location.href = x; })(u);
  }

  function closePlayer(fromPop) {
    const p = $("#hv-player");
    if (!p || p.classList.contains("hidden") || p.__closing) return;
    p.__closing = true;
    const box = p.querySelector(".hv-box");
    const finish = () => {
      $("#hvFrame").innerHTML = "";   // 재생 중지
      p.classList.add("hidden");
      p.classList.remove("hv-out");
      p.__closing = false;
      document.body.style.overflow = "";
      document.body.classList.remove("hv-playing");
      vid = null;
      // 뒤로가기로 닫힌 게 아니면(X·딤·스와이프) history에서 우리 항목을 정리
      if (!fromPop) { try { if (history.state && history.state.hvOpen) history.back(); } catch (_) {} }
    };
    // 🔙 SPA 페이지처럼 우로 슬라이드 아웃(뒤 페이지가 드러남) → 끝나면 정리
    p.classList.add("hv-out");
    let done = false;
    const fin = () => { if (done) return; done = true; finish(); };
    if (box) box.addEventListener("animationend", fin, { once: true });
    setTimeout(fin, 300);   // animationend 미발화 폴백
  }
  // 🔙 뒤로가기 제스처/버튼 → 플레이어 닫기(문서 이탈 대신)
  window.addEventListener("popstate", () => {
    const p = $("#hv-player");
    if (p && !p.classList.contains("hidden")) closePlayer(true);
  });

  /* 🎬 다음 영상 — 현재 영상 아래에 다른 핫튜브를 목록으로. 탭하면 '페이지 안 벗어나고' 제자리 교체(유튜브식). */
  const fmtDur = (iso) => {
    const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
    if (!m) return "";
    const h = +(m[1] || 0), mi = +(m[2] || 0), s = +(m[3] || 0);
    return h ? `${h}:${String(mi).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${mi}:${String(s).padStart(2, "0")}`;
  };
  let relatedBound = false;
  async function loadRelated(curId) {
    const box = $("#hvRelated");
    if (!box) return;
    try {
      const c = await sb();
      if (!c) return;
      const { data } = await (window.GALLA_lfilter||function(q){return q;})(c.from("youtube_hot")
        .select("video_id,title,channel_title,thumbnail,view_count,duration")
        .neq("video_id", curId)
        .not("channel_title", "ilike", "%- Topic")
        .order("view_count", { ascending: false, nullsFirst: false })
        .limit(40));
      const seen = new Set([curId]);
      const list = (data || []).filter(v => v && v.video_id && !seen.has(v.video_id) && seen.add(v.video_id)).slice(0, 15);
      if (!list.length) { box.innerHTML = ""; return; }
      box.innerHTML = '<div class="hv-related-h">다음 영상</div>' + list.map(v => `
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
      // 위임(1회) — 탭 시 제자리 교체(닫지 않고 openPlayer만 다시)
      if (!relatedBound) {
        relatedBound = true;
        box.addEventListener("click", (e) => {
          const el = e.target.closest(".hv-rel");
          if (!el) return;
          openPlayer(el.dataset.id, el.dataset.title || "", el.dataset.ch || "");
        });
      }
    } catch (_) { box.innerHTML = ""; }
  }

  // 통합 검색의 유튜브 결과에서도 같은 플레이어를 연다
  window.GALLA_OpenVideo = openPlayer;

  /* ---------- 핫트렌드 탭에서 재사용 ---------- */
  window.GALLA_HotShelf = async function (el, n = 10) {
    if (!el) return;
    const rows = (await loadFeed("all")).filter((v) => !v.is_short);
    if (!rows.length) { el.innerHTML = ""; return; }
    el.innerHTML = `<div class="hv-shelf">${rows.slice(0, n).map(tileHTML).join("")}</div>`;
  };

  /* ---------- 바인딩 ---------- */
  // 탭 전환은 search.js의 핸들러가 늦게 붙어서 click()만으로는 안 먹을 수 있다.
  // 공유 랜딩으로 들어온 경우엔 직접 active를 갈아끼운다.
  function openHotTab() {
    document.querySelectorAll(".tab-item").forEach((t) =>
      t.classList.toggle("active", t.dataset.tab === "hot"));
    document.querySelectorAll(".tab-panel").forEach((p) =>
      p.classList.toggle("active", p.dataset.panel === "hot"));
    if (!booted) { booted = true; render(); }
  }

  function bind() {
    const hotTab = document.querySelector('.tab-item[data-tab="hot"]');
    hotTab?.addEventListener("click", () => {
      if (booted) return;
      booted = true;
      render();
    });

    /* ⚠️ 클릭에만 걸면 **클릭 없이 켜진 경우 목록이 영영 안 뜬다.**
       search.html?tab=hot 로 직접 들어오거나, 세션 복원으로 핫튜브가 켜진 채 시작하면
       search.js가 activateTab()으로 탭만 바꾸고 클릭 이벤트는 없다 → 빈 화면(실제로 그랬다).
       탭이 '활성'이 되는 순간을 보고 부팅한다 — 클릭이든 프로그램이든 상관없이 잡힌다. */
    const bootIfActive = () => {
      if (booted || !hotTab?.classList.contains("active")) return;
      booted = true;
      render();
    };
    bootIfActive();                                  // 이미 켜진 채 들어온 경우
    if (hotTab) {
      try {
        new MutationObserver(bootIfActive)
          .observe(hotTab, { attributes: true, attributeFilter: ["class"] });
      } catch (_) {}
    }

    // 핫트렌드 탭의 '지금 뜨는 영상' 선반
    let shelfDone = false;
    document.querySelector('.tab-item[data-tab="trending"]')?.addEventListener("click", () => {
      if (shelfDone) return;
      shelfDone = true;
      window.GALLA_HotShelf($("#trending-video-shelf"), 10);
    });

    document.addEventListener("click", (e) => {
      const card = e.target.closest(".hv-card, .hv-tile, .hv-hero, .hv-scell");
      if (card) { openPlayer(card.dataset.id, card.dataset.title, card.dataset.ch); return; }

      const more = e.target.closest(".hv-more");
      if (more) { goto(more.dataset.goto); return; }

      const chip = e.target.closest(".hv-chip");
      if (chip) { goto(chip.dataset.feed); return; }

      const mb = e.target.closest(".hv-mode-btn");
      if (mb) { setMode(mb.dataset.mode); return; }

      const g = e.target.closest("[data-tab-goto]");
      if (g) { document.querySelector(`.tab-item[data-tab="${g.dataset.tabGoto}"]`)?.click(); return; }
    });

    // ⚠️ closePlayer 를 직접 리스너로 넣으면 click 이벤트가 fromPop 인자로 들어가 history 정리를 건너뛴다 → 감싼다.
    $("#hvClose")?.addEventListener("click", () => closePlayer());
    $("#hv-player")?.querySelector(".hv-dim")?.addEventListener("click", () => closePlayer());

    /* 🔙 플레이어 전용 '좌→우 스와이프로 닫기(페이지 뒤로)'.
       앱은 네이티브 엣지제스처를 끄고 nav.js 커스텀 스와이프로 뒤로가기를 처리하는데,
       그 핸들러는 overlayOpen()이면 비활성이라 오버레이인 이 플레이어 위에선 안 먹는다.
       그래서 여기서 직접 좌측 시작 수평 스와이프를 잡아 closePlayer 로 닫는다(제자리 교체 X, 진짜 닫기).
       세로 스크롤(다음 영상)·유튜브 영역 터치와 충돌 않도록 좌측 시작 + 수평 우세일 때만. */
    (function () {
      const pl = $("#hv-player");
      if (!pl) return;
      let sx = 0, sy = 0, armed = false, lock = 0; // lock 0미정 1수평 2취소
      pl.addEventListener("touchstart", (e) => {
        if (e.touches.length !== 1) { armed = false; return; }
        const x = e.touches[0].clientX;
        armed = x < 60;                 // 좌측 가장자리에서 시작한 스와이프만(뒤로가기 관습)
        sx = x; sy = e.touches[0].clientY; lock = 0;
      }, { passive: true });
      pl.addEventListener("touchmove", (e) => {
        if (!armed || e.touches.length !== 1 || lock === 2) return;
        const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
        if (!lock) {
          if (Math.abs(dy) > 14 && Math.abs(dy) >= Math.abs(dx)) { lock = 2; return; } // 세로 양보
          if (dx > 16 && dx > Math.abs(dy) * 1.4) lock = 1;                            // 우측 수평 확정
          else if (dx < -10) lock = 2;
        }
      }, { passive: true });
      pl.addEventListener("touchend", (e) => {
        const dx = (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : sx) - sx;
        if (lock === 1 && dx > 80 && !pl.classList.contains("hidden")) closePlayer();
        armed = false; lock = 0;
      }, { passive: true });
    })();
    $("#hvLike")?.addEventListener("click", toggleLike);
    $("#hvShare")?.addEventListener("click", share);
    $("#hvComment")?.addEventListener("click", () => {
      const w = $("#hvCmtWrap");
      w.classList.toggle("hidden");
      if (!w.classList.contains("hidden")) loadComments();
    });
    window.GALLA_ghostBind && window.GALLA_ghostBind(document.getElementById("hvGhost"));
    $("#hvCmtSend")?.addEventListener("click", sendComment);
    $("#hvCmtInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment(); }
    });
    $("#hvReplyX")?.addEventListener("click", () => setReply(null));

    $("#hvCmtList")?.addEventListener("click", (e) => {
      const l = e.target.closest("[data-like]");
      if (l) { toggleCmtLike(Number(l.dataset.like), l); return; }
      const r = e.target.closest("[data-reply]");
      if (r) { setReply(Number(r.dataset.reply), r.dataset.nick); return; }
      const d = e.target.closest("[data-del]");
      if (d) { delComment(Number(d.dataset.del)); return; }
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

    // 공유 랜딩에서 들어온 경우 — /search.html?video=<id> → 그 영상 바로 열기
    const want = new URLSearchParams(location.search).get("video");
    if (want) {
      // 탭 활성화는 search.js가 ?video= 를 보고 해준다(딥링크 규약).
      // 여기선 목록 렌더와 재생만 맡는다.
      openHotTab();
      (async () => {
        const rows = await loadFeed("all");
        const v = rows.find((x) => x.video_id === want);
        if (v) openPlayer(v.video_id, v.title, v.channel_title);
        else openPlayer(want, "핫영상", "");
      })();
    }
  }

  // MPA(동기 로드) = DOMContentLoaded 대기(기존 그대로) / SPA = 뷰 마운트 후 동적 로드라
  // 이미 지난 이벤트를 기다리면 영원히 안 붙는다 → 즉시 바인딩
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
