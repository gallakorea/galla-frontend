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
    gift:    "M20 6h-2.18c.11-.31.18-.65.18-1a2.996 2.996 0 00-5.5-1.65l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76l1-1.36 1 1.36L15.38 12 17 10.83 14.92 8H20v6z",
    cash:    "M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z",
    chart:   "M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z",
  };
  // 인라인 SVG 생성 (fill=currentColor → CSS로 색 지정)
  window.GALLA_svgIcon = function (name) {
    return `<svg class="ic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${P[name] || P.bell}"/></svg>`;
  };
  const svg = window.GALLA_svgIcon;

  /* 유형 정의 — 아이콘·색·필터키
     이슈: 댓글·좋아요·싫어요·전투·투표
     광장: 광장 댓글·광장 투표
     소셜: 팔로워·DM
     예측: 마켓 정산
     정산: 이슈 승리·후원·출금 */
  const TYPE = {
    comment:         { ic: "comment", cls: "t-comment", key: "comment" },
    reply:           { ic: "comment", cls: "t-comment", key: "comment" },
    plaza_comment:   { ic: "comment", cls: "t-comment", key: "comment" },
    like:            { ic: "like",    cls: "t-like",    key: "like" },
    plaza_like:      { ic: "like",    cls: "t-like",    key: "like" },
    dislike:         { ic: "dislike", cls: "t-dislike", key: "dislike" },
    follow:          { ic: "follow",  cls: "t-follow",  key: "follow" },
    dm:              { ic: "comment", cls: "t-dm",      key: "follow" },
    vote:            { ic: "vote",    cls: "t-vote",    key: "vote" },
    plaza_vote:      { ic: "vote",    cls: "t-vote",    key: "vote" },
    attack:          { ic: "bolt",    cls: "t-attack",  key: "battle" },
    defend:          { ic: "shield",  cls: "t-defend",  key: "battle" },
    support:         { ic: "shield",  cls: "t-support", key: "battle" },
    duel:            { ic: "swords",  cls: "t-duel",    key: "battle" },
    duel_result:     { ic: "swords",  cls: "t-duel",    key: "battle" },
    issue_win:       { ic: "trophy",  cls: "t-win",     key: "reward" },
    donation:        { ic: "gift",    cls: "t-donation", key: "reward" },
    withdrawal:      { ic: "cash",    cls: "t-cash",    key: "reward" },
    market_resolved: { ic: "chart",   cls: "t-market",  key: "predict" },
  };
  const typeOf = (t) => TYPE[t] || { ic: "bell", cls: "t-etc", key: "etc" };

  /* 보조 데이터: 보낸 사람 프로필·닉네임 / 이슈 썸네일 / 내 팔로잉 */
  let AVATARS = {};   // uid -> avatar_url
  let NICKS = {};     // uid -> nickname
  let THUMBS = {};    // issue_id -> thumbnail_url
  const FOLLOWING = new Set();  // 내가 팔로우 중인 uid (맞팔로우 라벨용)

  async function loadExtras(rows) {
    const sb = window.supabaseClient;
    const uids = [...new Set(rows.map(r => r.from_user).filter(Boolean))].filter(u => !(u in AVATARS));
    const iids = [...new Set(rows.map(r => r.issue_id).filter(Boolean))].filter(i => !(i in THUMBS));

    const jobs = [];
    if (uids.length) jobs.push(sb.from("users").select("id,nickname,avatar_url").in("id", uids)
      .then(({ data }) => (data || []).forEach(u => { AVATARS[u.id] = u.avatar_url; NICKS[u.id] = u.nickname; })));
    if (iids.length) jobs.push(sb.from("issues").select("id,thumbnail_url").in("id", iids)
      .then(({ data }) => (data || []).forEach(i => { THUMBS[i.id] = i.thumbnail_url; })));
    await Promise.all(jobs);
  }

  async function loadFollowing() {
    const { data } = await window.supabaseClient.from("follows").select("following").eq("follower", ME);
    (data || []).forEach(r => FOLLOWING.add(r.following));
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

  /* ── 같은 대상·같은 유형 알림 묶기 (인스타식 "A님, B님 외 N명이 …") ── */
  const GROUPABLE = new Set(["like", "plaza_like", "dislike", "vote", "plaza_vote", "attack", "defend", "support"]);
  function buildGroups(rows) {
    const out = [], map = new Map();
    rows.forEach(r => {
      const target = r.issue_id || r.link || "";
      if (GROUPABLE.has(r.type) && target) {
        const k = r.type + "|" + target;
        if (map.has(k)) { map.get(k).rows.push(r); return; }
        const g = { rows: [r] };
        map.set(k, g); out.push(g);
      } else {
        out.push({ rows: [r] });
      }
    });
    return out;
  }
  // 메시지 꼬리("…님이 회원님의 갈라를 좋아합니다"의 뒷부분) 추출
  function msgTail(m) {
    const s = String(m || "");
    const i = s.indexOf("님이 ");
    return i > -1 ? s.slice(i + 3) : s;
  }

  function rowHTML(g) {
    const n = g.rows[0];                       // 대표(최신) 알림
    const t = typeOf(n.type);
    const ids = g.rows.map(r => r.id).join(",");
    const unread = g.rows.some(r => !r.read);
    const thumb = n.issue_id ? THUMBS[n.issue_id] : null;

    // 묶인 알림이면 "A님, B님 외 N명이 …"로 재구성 (서로 다른 사람 기준)
    const uniqUsers = [...new Set(g.rows.map(r => r.from_user).filter(Boolean))];
    let msg = n.message || "새 활동";
    if (g.rows.length > 1 && uniqUsers.length >= 1) {
      const nick = uid => NICKS[uid] || "갈라이안";
      const shown = uniqUsers.slice(0, 2).map(u => `<b>${esc(nick(u))}</b>님`).join(", ");
      const extra = uniqUsers.length - Math.min(uniqUsers.length, 2);
      msg = `${shown}${extra > 0 ? ` 외 ${extra}명` : ""}이 ${esc(msgTail(n.message))}`;
    } else {
      msg = esc(msg);
    }

    // 우측: 팔로워면 맞팔로우 버튼(이미 팔로우 중이면 팔로잉), 그 외엔 콘텐츠 썸네일
    let right = "";
    if (t.key === "follow" && n.from_user) {
      const done = FOLLOWING.has(n.from_user);
      right = `<button type="button" class="np-follow ${done ? "done" : ""}" data-uid="${esc(n.from_user)}">${done ? "팔로잉" : "맞팔로우"}</button>`;
    } else if (thumb) {
      right = `<span class="np-thumb"><img src="${esc(thumb)}" alt="" loading="lazy"></span>`;
    } else {
      right = `<span class="np-thumb none">${svg(t.ic)}</span>`;
    }

    // 아바타 — 묶음이면 두 명 스택
    const ava = (uniqUsers.length >= 2)
      ? `<span class="np-ava-stack">${avatarHTML(uniqUsers[1])}${avatarHTML(uniqUsers[0])}</span>`
      : avatarHTML(n.from_user);

    // 스와이프 셸: .np-row > (a.np-item + 삭제 버튼)
    return `<div class="np-row" data-ids="${ids}">
      <a class="np-item ${unread ? "unread" : ""}" data-id="${n.id}" data-ids="${ids}" href="${esc(n.link || "#")}">
        <span class="np-avawrap">
          ${ava}
          <span class="np-badge ${t.cls}">${svg(t.ic)}</span>
        </span>
        <span class="np-mid">
          <span class="np-msg">${msg}</span>
          <span class="np-time">${timeAgo(n.created_at)}${g.rows.length > 1 ? ` · ${g.rows.length}건` : ""}</span>
        </span>
        ${right}
      </a>
      <button type="button" class="np-del" data-ids="${ids}" aria-label="삭제">🗑</button>
    </div>`;
  }

  function render() {
    const rows = FILTER === "all" ? ROWS : ROWS.filter(r => typeOf(r.type).key === FILTER);
    const el = listEl();
    if (!rows.length) {
      el.innerHTML = `<div class="np-empty">아직 알림이 없어요.<br>갈라에서 활동하면 반응이 여기 쌓입니다!</div>`;
      return;
    }
    // 시간 그룹(오늘/이번 주/이전) 안에서 같은 대상·유형끼리 묶는다
    const groups = { "오늘": [], "이번 주": [], "이전": [] };
    rows.forEach(r => groups[bucket(r.created_at)].push(r));

    el.innerHTML = Object.entries(groups)
      .filter(([, list]) => list.length)
      .map(([label, list]) =>
        `<div class="np-group"><div class="np-gtitle">${label}</div>${buildGroups(list).map(rowHTML).join("")}</div>`)
      .join("");
    bindSwipe();
  }

  /* ── 스와이프 삭제 (인스타식: 왼쪽으로 밀면 🗑, 탭하면 그 알림 묶음 삭제) ── */
  let OPEN_ROW = null;
  function closeOpenRow() {
    if (OPEN_ROW) { OPEN_ROW.querySelector(".np-item").style.transform = ""; OPEN_ROW.classList.remove("swiped"); OPEN_ROW = null; }
  }
  function bindSwipe() {
    listEl().querySelectorAll(".np-row").forEach(row => {
      const item = row.querySelector(".np-item");
      let x0 = 0, y0 = 0, dx = 0, dragging = false;
      row.addEventListener("touchstart", (e) => {
        const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; dx = 0; dragging = false;
      }, { passive: true });
      row.addEventListener("touchmove", (e) => {
        const t = e.touches[0];
        const mx = t.clientX - x0, my = t.clientY - y0;
        if (!dragging && Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my) * 1.4) {
          dragging = true;
          row.classList.add("dragging");
          if (OPEN_ROW && OPEN_ROW !== row) closeOpenRow();
        }
        if (!dragging) return;
        dx = Math.min(0, Math.max(-96, mx + (row.classList.contains("swiped") ? -72 : 0)));
        item.style.transform = `translateX(${dx}px)`;
      }, { passive: true });
      row.addEventListener("touchend", () => {
        if (!dragging) return;
        row.classList.remove("dragging");
        if (dx < -40) { item.style.transform = "translateX(-72px)"; row.classList.add("swiped"); OPEN_ROW = row; }
        else { item.style.transform = ""; row.classList.remove("swiped"); if (OPEN_ROW === row) OPEN_ROW = null; }
      });
    });
  }
  async function deleteRow(rowEl, ids) {
    rowEl.style.height = rowEl.offsetHeight + "px";
    requestAnimationFrame(() => { rowEl.classList.add("removing"); rowEl.style.height = "0px"; });
    setTimeout(() => rowEl.remove(), 260);
    const idNums = ids.split(",").map(Number);
    ROWS = ROWS.filter(r => !idNums.includes(r.id));
    await window.supabaseClient.from("notifications").delete().in("id", idNums);
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
    await Promise.all([loadExtras(ROWS), loadFollowing()]);
    render();

    // 페이지를 연 것 = 확인 → 읽음 처리(뱃지 제거). 목록의 unread 표시는 이번 열람 동안 유지.
    // ★ await 필수: supabase-js 쿼리 빌더는 thenable이라 await(또는 .then) 하기 전엔
    //   요청 자체를 보내지 않는다. 예전엔 await이 없어서 이 UPDATE가 한 번도 실행되지 않았고,
    //   그래서 알림을 확인해도 다시 '안 읽음'으로 되돌아왔다.
    if (ROWS.some(r => !r.read)) {
      const { error: upErr } = await sb.from("notifications")
        .update({ read: true }).eq("user_id", ME).eq("read", false);
      if (upErr) { console.error("[noti] 읽음 처리 실패", upErr); return; }
      ROWS.forEach(r => { r.read = true; });
      window.GALLA_notiRefresh?.();   // 헤더 뱃지·요약칩 즉시 갱신
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

    // 항목 클릭 → 읽음 + 이동 / 맞팔로우 / 스와이프 삭제 버튼
    listEl().addEventListener("click", async (e) => {
      const del = e.target.closest(".np-del");
      if (del) {
        e.preventDefault(); e.stopPropagation();
        deleteRow(del.closest(".np-row"), del.dataset.ids);
        OPEN_ROW = null;
        return;
      }

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
        if (!error || error.code === "23505") FOLLOWING.add(uid);
        return;
      }

      const item = e.target.closest(".np-item");
      if (!item) return;
      // 스와이프로 열린 행이 있으면 첫 탭은 '닫기'
      if (OPEN_ROW) { e.preventDefault(); closeOpenRow(); return; }
      // 표시만 끈다. DB 읽음 처리는 load()에서 페이지 전체를 이미 끝냈으므로 중복이고,
      // 여기서 요청을 걸어봐야 바로 이어지는 href 이동에 취소당한다(그래서 예전엔 안 먹혔다).
      item.classList.remove("unread");
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
