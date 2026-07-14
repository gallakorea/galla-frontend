/* =========================================================
   notifications-page.js — 인스타식 알림 페이지
   - 유형별 렌더: 💬댓글 · 👍좋아요 · 👎싫어요 · 👤팔로워 (그 외 전투/투표도 지원)
   - 시간 그룹: 오늘 / 이번 주 / 이전
   - 프로필 사진 + (팔로워면 팔로우 버튼 / 그 외면 콘텐츠 썸네일)
   - 페이지를 열면 '확인'으로 간주 → 읽음 처리 + 헤더 뱃지 제거
========================================================= */
(function () {
  let ME = null;
  let ROWS = [];
  let FILTER = "all";
  let CH = null;

  const listEl = () => document.getElementById("npList");

  function esc(s) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // created_at 이 timestamp(무시간대)라 Z를 붙여 UTC로 해석
  function ts(iso) {
    return new Date(String(iso) + (String(iso).endsWith("Z") ? "" : "Z")).getTime();
  }
  function timeAgo(iso) {
    const d = (Date.now() - ts(iso)) / 1000;
    if (d < 60) return "방금";
    if (d < 3600) return Math.floor(d / 60) + "분";
    if (d < 86400) return Math.floor(d / 3600) + "시간";
    if (d < 604800) return Math.floor(d / 86400) + "일";
    return Math.floor(d / 604800) + "주";
  }
  // 오늘 / 이번 주 / 이전
  function bucket(iso) {
    const age = Date.now() - ts(iso);
    if (age < 86400000) return "오늘";
    if (age < 604800000) return "이번 주";
    return "이전";
  }

  /* 유형 정의 — 아이콘·색·필터키 */
  const TYPE = {
    comment:       { ico: "💬", cls: "t-comment", key: "comment" },
    reply:         { ico: "💬", cls: "t-comment", key: "comment" },
    plaza_comment: { ico: "💬", cls: "t-comment", key: "comment" },
    like:          { ico: "👍", cls: "t-like",    key: "like" },
    plaza_like:    { ico: "👍", cls: "t-like",    key: "like" },
    dislike:       { ico: "👎", cls: "t-dislike", key: "dislike" },
    follow:        { ico: "👤", cls: "t-follow",  key: "follow" },
    attack:        { ico: "💥", cls: "t-attack",  key: "battle" },
    defend:        { ico: "🛡", cls: "t-defend",  key: "battle" },
    support:       { ico: "💣", cls: "t-support", key: "battle" },
    vote:          { ico: "🗳", cls: "t-vote",    key: "vote" },
    duel_result:   { ico: "⚔️", cls: "t-duel",    key: "battle" },
    issue_win:     { ico: "🏆", cls: "t-win",     key: "battle" },
  };
  const typeOf = (t) => TYPE[t] || { ico: "🔔", cls: "t-etc", key: "etc" };

  /* 보조 데이터: 보낸 사람 프로필 사진 / 이슈 썸네일 */
  let AVATARS = {};   // uid -> avatar_url
  let THUMBS = {};    // issue_id -> thumbnail_url

  async function loadExtras(rows) {
    const sb = window.supabaseClient;
    const uids = [...new Set(rows.map(r => r.from_user).filter(Boolean))];
    const iids = [...new Set(rows.map(r => r.issue_id).filter(Boolean))];

    if (uids.length) {
      const { data } = await sb.from("users").select("id,avatar_url").in("id", uids);
      (data || []).forEach(u => { AVATARS[u.id] = u.avatar_url; });
    }
    if (iids.length) {
      const { data } = await sb.from("issues").select("id,thumbnail_url").in("id", iids);
      (data || []).forEach(i => { THUMBS[i.id] = i.thumbnail_url; });
    }
  }

  function avatarHTML(uid) {
    const fallback = window.GALLA_DEFAULT_AVATAR || "/assets/app-icons/profile-circle-128.png";
    const src = uid && window.GALLA_avatarSrc ? window.GALLA_avatarSrc(AVATARS[uid]) : fallback;
    const tag = `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${fallback}'">`;
    // 프로필 클릭 → 마이페이지 (전역 data-profile-uid 핸들러)
    return uid
      ? `<span class="np-ava" data-profile-uid="${esc(uid)}" role="button" aria-label="프로필">${tag}</span>`
      : `<span class="np-ava">${tag}</span>`;
  }

  function rowHTML(n) {
    const t = typeOf(n.type);
    const thumb = n.issue_id ? THUMBS[n.issue_id] : null;

    // 우측: 팔로워면 '팔로우' 버튼, 그 외엔 콘텐츠 썸네일
    let right = "";
    if (t.key === "follow" && n.from_user) {
      right = `<button type="button" class="np-follow" data-uid="${esc(n.from_user)}">팔로우</button>`;
    } else if (thumb) {
      right = `<span class="np-thumb"><img src="${esc(thumb)}" alt="" loading="lazy"></span>`;
    } else {
      right = `<span class="np-thumb none">${t.ico}</span>`;
    }

    return `<a class="np-item ${n.read ? "" : "unread"}" data-id="${n.id}" href="${esc(n.link || "#")}">
      <span class="np-avawrap">
        ${avatarHTML(n.from_user)}
        <span class="np-badge ${t.cls}">${t.ico}</span>
      </span>
      <span class="np-mid">
        <span class="np-msg">${esc(n.message || "새 활동")}</span>
        <span class="np-time">${timeAgo(n.created_at)}</span>
      </span>
      ${right}
    </a>`;
  }

  function render() {
    const rows = FILTER === "all" ? ROWS : ROWS.filter(r => typeOf(r.type).key === FILTER);
    const el = listEl();
    if (!rows.length) {
      el.innerHTML = `<div class="np-empty">아직 알림이 없어요.<br>갈라에서 활동하면 반응이 여기 쌓입니다!</div>`;
      return;
    }
    // 시간 그룹으로 묶기
    const groups = { "오늘": [], "이번 주": [], "이전": [] };
    rows.forEach(r => groups[bucket(r.created_at)].push(r));

    el.innerHTML = Object.entries(groups)
      .filter(([, list]) => list.length)
      .map(([label, list]) =>
        `<div class="np-group"><div class="np-gtitle">${label}</div>${list.map(rowHTML).join("")}</div>`)
      .join("");
  }

  async function markAllRead() {
    await window.supabaseClient.from("notifications")
      .update({ read: true }).eq("user_id", ME).eq("read", false);
    ROWS.forEach(r => { r.read = true; });
    document.querySelectorAll(".np-item.unread").forEach(el => el.classList.remove("unread"));
    // 헤더 뱃지도 즉시 끄기
    const b = document.getElementById("notiBadge");
    if (b) b.hidden = true;
  }

  async function load() {
    const sb = window.supabaseClient;
    const { data, error } = await sb
      .from("notifications")
      .select("id,type,message,link,read,created_at,from_user,issue_id")
      .eq("user_id", ME)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      listEl().innerHTML = `<div class="np-empty">알림을 불러오지 못했어요.</div>`;
      return;
    }
    ROWS = data || [];
    await loadExtras(ROWS);
    render();

    // 페이지를 연 것 = 확인 → 읽음 처리(뱃지 제거). 목록의 unread 표시는 이번 열람 동안 유지.
    if (ROWS.some(r => !r.read)) {
      sb.from("notifications").update({ read: true }).eq("user_id", ME).eq("read", false);
    }
  }

  function bind() {
    // 유형 필터
    document.getElementById("npFilters").addEventListener("click", (e) => {
      const chip = e.target.closest(".np-chip");
      if (!chip) return;
      document.querySelectorAll(".np-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      FILTER = chip.dataset.f;
      render();
    });

    document.getElementById("npReadAll").addEventListener("click", markAllRead);

    // 항목 클릭 → 개별 읽음 + 이동 / 팔로우 버튼
    listEl().addEventListener("click", async (e) => {
      const fb = e.target.closest(".np-follow");
      if (fb) {
        e.preventDefault();
        e.stopPropagation();
        const uid = fb.dataset.uid;
        if (fb.classList.contains("done")) return;
        const { error } = await window.supabaseClient
          .from("follows").insert({ follower: ME, following: uid });
        // 이미 팔로우 중이어도(중복키) 버튼 상태만 바꾼다
        fb.classList.add("done");
        fb.textContent = error && error.code !== "23505" ? "실패" : "팔로잉";
        return;
      }

      const item = e.target.closest(".np-item");
      if (!item) return;
      if (item.classList.contains("unread")) {
        item.classList.remove("unread");
        window.supabaseClient.from("notifications").update({ read: true }).eq("id", Number(item.dataset.id));
      }
      const href = item.getAttribute("href");
      if (!href || href === "#") e.preventDefault();
    });
  }

  function subscribe() {
    if (CH) window.supabaseClient.removeChannel(CH);
    CH = window.supabaseClient
      .channel("noti-page-" + ME)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + ME },
        async (payload) => {
          ROWS.unshift(payload.new);
          await loadExtras([payload.new]);
          render();
        })
      .subscribe();
  }

  (async function init() {
    const sb = window.supabaseClient ||
      (window.waitForSupabaseClient ? await window.waitForSupabaseClient() : null);
    if (!sb) return;
    const { data: sess } = await sb.auth.getSession();
    ME = sess?.session?.user?.id || null;
    if (!ME) {
      listEl().innerHTML = `<div class="np-empty">로그인하면 내 알림을 볼 수 있어요.<br><a class="np-login" href="login.html">로그인하기</a></div>`;
      return;
    }
    bind();
    await load();
    subscribe();
  })();
})();
