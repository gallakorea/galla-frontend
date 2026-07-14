/* =========================================================
   hot-videos.js — 검색 > 🎬 핫영상 (유튜브 인기 급상승)
   - youtube_hot(피드별, 30분 크론 수집)을 카테고리로 나눠 렌더
   - '전체'는 히어로 + TOP10 + 카테고리별 가로 선반(넷플릭스식)
   - 카테고리 선택 시 해당 피드 전체 목록
   - 재생은 공식 유튜브 iframe (우리가 호스팅하지 않음 = ToS 준수)
   - 플레이어에 좋아요/댓글/공유 (galla 자체 소셜)
   - window.GALLA_HotShelf(el, n) 로 핫트렌드 탭에서도 재사용
========================================================= */
(function () {
  // 방송 카테고리 — 라벨/아이콘은 여기서만 관리
  const CATS = [
    { id: "all",    label: "전체",     emoji: "🔥" },
    { id: "news",   label: "뉴스·시사", emoji: "📰" },
    { id: "ent",    label: "예능",     emoji: "🎭" },
    { id: "drama",  label: "드라마",   emoji: "🎬" },
    { id: "movie",  label: "영화·애니", emoji: "🍿" },
    { id: "music",  label: "음악",     emoji: "🎵" },
    { id: "comic",  label: "코믹",     emoji: "😂" },
    { id: "game",   label: "게임",     emoji: "🎮" },
    { id: "sports", label: "스포츠",   emoji: "⚽" },
    { id: "life",   label: "일상",     emoji: "🧳" },
    { id: "beauty", label: "뷰티·패션", emoji: "💄" },
    { id: "tech",   label: "IT·과학",  emoji: "💻" },
    { id: "animal", label: "동물",     emoji: "🐾" },
  ];
  // '전체' 화면에 선반으로 깔 카테고리 순서
  const SHELVES = ["news", "ent", "drama", "movie", "music", "game", "sports", "comic"];

  const cache = new Map();   // feed → rows
  let current = "all";
  let booted = false;

  const $ = (s, r = document) => r.querySelector(s);
  const label = (id) => CATS.find((c) => c.id === id) || { label: id, emoji: "🎬" };

  const esc = (s) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function shortNum(n) {
    n = Number(n) || 0;
    if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, "") + "억";
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "만";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "천";
    return String(n);
  }

  // PT1H2M3S → 1:02:03
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
    const { data, error } = await c
      .from("youtube_hot")
      .select("video_id,title,channel_title,thumbnail,view_count,like_count,duration,published_at,rank")
      .eq("feed", feed)
      .order("rank", { ascending: true })
      .limit(50);
    const rows = error ? [] : (data || []);
    cache.set(feed, rows);
    return rows;
  }

  /* ---------- 카드 템플릿 ---------- */
  const dataAttrs = (v) =>
    `data-id="${esc(v.video_id)}" data-title="${esc(v.title)}" data-ch="${esc(v.channel_title || "")}"`;

  function heroHTML(v) {
    return `
      <button type="button" class="hv-hero" ${dataAttrs(v)}>
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

  // 가로 선반용 카드(세로형)
  function tileHTML(v) {
    return `
      <button type="button" class="hv-tile" ${dataAttrs(v)}>
        <span class="hv-tile-th">
          <img src="${esc(v.thumbnail || "")}" alt="" loading="lazy">
          ${v.duration ? `<span class="hv-dur">${dur(v.duration)}</span>` : ""}
        </span>
        <span class="hv-tile-t">${esc(v.title)}</span>
        <span class="hv-tile-m">조회 ${shortNum(v.view_count)}</span>
      </button>`;
  }

  // 목록용 카드(가로형)
  function rowHTML(v, showRank) {
    return `
      <button type="button" class="hv-card" ${dataAttrs(v)}>
        <span class="hv-thumb">
          <img src="${esc(v.thumbnail || "")}" alt="" loading="lazy">
          ${showRank ? `<span class="hv-rank">${v.rank}</span>` : ""}
          ${v.duration ? `<span class="hv-dur">${dur(v.duration)}</span>` : ""}
        </span>
        <span class="hv-meta">
          <span class="hv-t">${esc(v.title)}</span>
          <span class="hv-ch">${esc(v.channel_title || "")}</span>
          <span class="hv-stat">조회 ${shortNum(v.view_count)} · 👍 ${shortNum(v.like_count)} · ${timeAgo(v.published_at)}</span>
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
    // 선택 칩을 가운데로 — scrollIntoView는 조상(페이지)까지 가로로 밀어버려서
    // 선반/카드가 왼쪽으로 잘린다. 칩 컨테이너의 scrollLeft만 직접 옮긴다.
    const on = el.querySelector(".hv-chip.on");
    if (on) el.scrollLeft = on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2;
  }

  async function renderAll(el) {
    const rows = await loadFeed("all");
    if (!rows.length) {
      el.innerHTML = `<div class="hv-empty">아직 수집된 영상이 없어요.<br>잠시 후 다시 확인해 주세요.</div>`;
      return;
    }

    const hero = rows[0];
    const top = rows.slice(1, 11);

    el.innerHTML =
      heroHTML(hero) +
      sectionHTML(
        "실시간 급상승",
        "TOP 10",
        `<div class="hv-list">${top.map((v) => rowHTML(v, true)).join("")}</div>`,
      ) +
      // 선반은 자리만 잡아두고 병렬로 채운다(첫 화면이 빨리 뜨도록)
      SHELVES.map(
        (f) => `<div class="hv-shelf-slot" data-feed="${f}"></div>`,
      ).join("");

    // 카테고리 선반 병렬 로드
    await Promise.all(
      SHELVES.map(async (f) => {
        const slot = el.querySelector(`.hv-shelf-slot[data-feed="${f}"]`);
        if (!slot) return;
        const list = await loadFeed(f);
        if (!list.length) { slot.remove(); return; }
        const c = label(f);
        slot.outerHTML = sectionHTML(
          `${c.emoji} ${c.label}`,
          "",
          `<div class="hv-shelf">${list.slice(0, 12).map(tileHTML).join("")}</div>`,
          f,
        );
      }),
    );
  }

  async function renderFeed(el, feed) {
    const rows = await loadFeed(feed);
    const c = label(feed);
    if (!rows.length) {
      el.innerHTML = `<div class="hv-empty">${c.label} 카테고리엔 지금 뜨는 영상이 없어요.</div>`;
      return;
    }
    el.innerHTML = sectionHTML(
      `${c.emoji} ${c.label}`,
      `인기 ${rows.length}편`,
      `<div class="hv-list">${rows.map((v) => rowHTML(v, true)).join("")}</div>`,
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
    document.querySelector('.tab-panel[data-panel="hot"]')?.scrollIntoView({ block: "start" });
  }

  /* =======================================================
     플레이어 + 소셜 (좋아요 / 댓글 / 공유)
  ======================================================= */
  let vid = null, vtitle = "", liked = false, likeN = 0;

  const ytUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

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
    const b = $("#hvLike");
    b.classList.toggle("on", liked);
    $("#hvLikeN").textContent = likeN ? shortNum(likeN) : "좋아요";
  }

  async function toggleLike() {
    const c = await sb();
    if (!c) return;
    const { data: { user } } = await c.auth.getUser();
    if (!user) { location.href = "login.html"; return; }

    // 낙관적 갱신 — 실패하면 되돌린다
    const was = liked;
    liked = !liked;
    likeN += liked ? 1 : -1;
    paintLike();

    const q = liked
      ? c.from("video_likes").insert({ video_id: vid, user_id: user.id })
      : c.from("video_likes").delete().eq("video_id", vid).eq("user_id", user.id);
    const { error } = await q;
    if (error) {
      liked = was;
      likeN += liked ? 1 : -1;
      paintLike();
    }
  }

  async function loadComments() {
    const box = $("#hvCmtList");
    box.innerHTML = `<div class="hv-cmt-empty">불러오는 중…</div>`;
    const c = await sb();
    const { data, error } = await c.rpc("video_comment_list", { p_video_id: vid });
    if (error || !data?.length) {
      box.innerHTML = `<div class="hv-cmt-empty">첫 댓글을 남겨보세요.</div>`;
      return;
    }
    box.innerHTML = data.map((m) => `
      <div class="hv-cmt" data-cid="${m.id}">
        ${m.avatar_url
          ? `<img class="hv-cmt-av" src="${esc(m.avatar_url)}" alt="">`
          : `<span class="hv-cmt-av hv-cmt-av0">${esc((m.nickname || "갈")[0])}</span>`}
        <div class="hv-cmt-b">
          <div class="hv-cmt-h">
            <span class="hv-cmt-n">${esc(m.nickname)}</span>
            <span class="hv-cmt-d">${timeAgo(m.created_at)}</span>
            ${m.mine ? `<button type="button" class="hv-cmt-x" data-del="${m.id}">삭제</button>` : ""}
          </div>
          <div class="hv-cmt-t">${esc(m.body)}</div>
        </div>
      </div>`).join("");
    $("#hvCommentN").textContent = shortNum(data.length);
  }

  async function sendComment() {
    const inp = $("#hvCmtInput");
    const body = inp.value.trim();
    if (!body) return;
    const c = await sb();
    const { data: { user } } = await c.auth.getUser();
    if (!user) { location.href = "login.html"; return; }

    inp.value = "";
    const { error } = await c.from("video_comments").insert({ video_id: vid, user_id: user.id, body });
    if (error) { inp.value = body; return; }
    loadComments();
  }

  async function delComment(id) {
    const c = await sb();
    await c.from("video_comments").delete().eq("id", id);
    loadComments();
  }

  async function share() {
    const url = ytUrl(vid);
    const payload = { title: vtitle, text: `${vtitle} — 갈라 핫영상`, url };
    try {
      if (navigator.share) { await navigator.share(payload); return; }
      await navigator.clipboard.writeText(url);
      toast("링크를 복사했어요");
    } catch (_) { /* 사용자가 공유를 취소한 경우 — 조용히 넘어간다 */ }
  }

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "hv-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  function openPlayer(id, title, ch) {
    vid = id; vtitle = title;
    const p = $("#hv-player");
    $("#hvTitle").textContent = title;
    $("#hvCh").textContent = ch || "";
    $("#hvOpen").href = ytUrl(id);
    // youtube-nocookie: 재생 전 추적 쿠키를 심지 않음
    $("#hvFrame").innerHTML =
      `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0"
               title="${esc(title)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write;
               encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    $("#hvCmtWrap").classList.add("hidden");
    p.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    loadSocial();
  }

  function closePlayer() {
    $("#hv-player").classList.add("hidden");
    $("#hvFrame").innerHTML = "";   // 재생 중지
    document.body.style.overflow = "";
    vid = null;
  }

  /* ---------- 핫트렌드 탭에서 재사용하는 선반 ---------- */
  window.GALLA_HotShelf = async function (el, n = 10) {
    if (!el) return;
    const rows = await loadFeed("all");
    if (!rows.length) { el.innerHTML = ""; return; }
    el.innerHTML = `<div class="hv-shelf">${rows.slice(0, n).map(tileHTML).join("")}</div>`;
  };

  /* ---------- 바인딩 ---------- */
  function bind() {
    document.querySelector('.tab-item[data-tab="hot"]')?.addEventListener("click", () => {
      if (booted) return;
      booted = true;
      render();
    });

    // 핫트렌드 탭의 '지금 뜨는 영상' 선반
    let shelfDone = false;
    document.querySelector('.tab-item[data-tab="trending"]')?.addEventListener("click", () => {
      if (shelfDone) return;
      shelfDone = true;
      window.GALLA_HotShelf($("#trending-video-shelf"), 10);
    });

    // 핫트렌드 → 핫영상 탭으로 이동
    document.addEventListener("click", (e) => {
      const g = e.target.closest("[data-tab-goto]");
      if (!g) return;
      document.querySelector(`.tab-item[data-tab="${g.dataset.tabGoto}"]`)?.click();
    });

    // 카드/타일/히어로 클릭 → 재생 (선반은 핫트렌드 탭에도 있으므로 document 위임)
    document.addEventListener("click", (e) => {
      const card = e.target.closest(".hv-card, .hv-tile, .hv-hero");
      if (card) { openPlayer(card.dataset.id, card.dataset.title, card.dataset.ch); return; }
      const more = e.target.closest(".hv-more");
      if (more) { goto(more.dataset.goto); return; }
      const chip = e.target.closest(".hv-chip");
      if (chip) { goto(chip.dataset.feed); return; }
    });

    $("#hvClose")?.addEventListener("click", closePlayer);
    $("#hv-player")?.querySelector(".hv-dim")?.addEventListener("click", closePlayer);
    $("#hvLike")?.addEventListener("click", toggleLike);
    $("#hvShare")?.addEventListener("click", share);
    $("#hvComment")?.addEventListener("click", () => {
      const w = $("#hvCmtWrap");
      w.classList.toggle("hidden");
      if (!w.classList.contains("hidden")) loadComments();
    });
    $("#hvCmtSend")?.addEventListener("click", sendComment);
    $("#hvCmtInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment(); }
    });
    $("#hvCmtList")?.addEventListener("click", (e) => {
      const d = e.target.closest("[data-del]");
      if (d) delComment(d.dataset.del);
    });
  }

  document.addEventListener("DOMContentLoaded", bind);
})();
