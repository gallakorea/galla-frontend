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

  /* 아이콘 — 이모지 대신 SVG (24x24, currentColor로 색 제어).
     assets/icons/*.svg 와 동일한 패스를 인라인으로 둔다(추가 요청 없이 색만 바꾸려고). */
  const P = {
    comment: "M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z",
    like:    "M1 21h4V9H1v12zM23 10c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z",
    dislike: "M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.3.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z",
    follow:  "M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
    bolt:    "M7 2v11h3v9l7-12h-4l4-8z",
    shield:  "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z",
    vote:    "M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
    swords:  "M6.92 5H5l9 9 1.92-1.92L6.92 5zM2 20.5L3.5 22l6.6-6.6-1.5-1.5L2 20.5zM19 3l-4.5 4.5 1.5 1.5L21 4.5V3h-2zM14.5 15.5L16 17l-1.9 1.9L15.5 20 22 13.5 20.5 12 14.5 15.5z",
    trophy:  "M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z",
    bell:    "M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z",
  };
  // 인라인 SVG 생성 (fill=currentColor → CSS로 색 지정)
  window.GALLA_svgIcon = function (name) {
    return `<svg class="ic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${P[name] || P.bell}"/></svg>`;
  };
  const svg = window.GALLA_svgIcon;

  /* 유형 정의 — 아이콘·색·필터키 */
  const TYPE = {
    comment:       { ic: "comment", cls: "t-comment", key: "comment" },
    reply:         { ic: "comment", cls: "t-comment", key: "comment" },
    plaza_comment: { ic: "comment", cls: "t-comment", key: "comment" },
    like:          { ic: "like",    cls: "t-like",    key: "like" },
    plaza_like:    { ic: "like",    cls: "t-like",    key: "like" },
    dislike:       { ic: "dislike", cls: "t-dislike", key: "dislike" },
    follow:        { ic: "follow",  cls: "t-follow",  key: "follow" },
    attack:        { ic: "bolt",    cls: "t-attack",  key: "battle" },
    defend:        { ic: "shield",  cls: "t-defend",  key: "battle" },
    support:       { ic: "shield",  cls: "t-support", key: "battle" },
    vote:          { ic: "vote",    cls: "t-vote",    key: "vote" },
    duel_result:   { ic: "swords",  cls: "t-duel",    key: "battle" },
    issue_win:     { ic: "trophy",  cls: "t-win",     key: "battle" },
  };
  const typeOf = (t) => TYPE[t] || { ic: "bell", cls: "t-etc", key: "etc" };

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
      right = `<span class="np-thumb none">${svg(t.ic)}</span>`;
    }

    return `<a class="np-item ${n.read ? "" : "unread"}" data-id="${n.id}" href="${esc(n.link || "#")}">
      <span class="np-avawrap">
        ${avatarHTML(n.from_user)}
        <span class="np-badge ${t.cls}">${svg(t.ic)}</span>
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
