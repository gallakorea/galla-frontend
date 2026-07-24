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
  let TAB = "activity";   // activity | message — 메시지(DM·삐삐)는 성격이 달라 따로 본다
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

  /* 아이콘은 공용 모듈(noti-icons.js)의 window.GALLA_svgIcon 사용 — 세트를 한 곳에서 관리 */
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
    dm:              { ic: "chat",    cls: "t-dm",      key: "message" },
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
    pager:           { ic: "pager",   cls: "t-pager",   key: "message" },
    report:          { ic: "bell",    cls: "t-etc",     key: "etc" },
    bug_report:      { ic: "bell",    cls: "t-etc",     key: "etc" },
  };
  const typeOf = (t) => TYPE[t] || { ic: "bell", cls: "t-etc", key: "etc" };
  /* 메시지 알림은 link가 비어 있는 경우가 많다 — 눌러도 아무 일이 없으면 최악이라
     DM(해당 대화)·삐삐 사서함으로 확실히 보낸다. */
  function linkOf(n) {
    if (n.link) return n.link;
    if (n.type === "dm") return n.actor_id ? `dm.html?to=${encodeURIComponent(n.actor_id)}` : "dm.html";
    if (n.type === "pager") return "dm.html?pager=1";
    return "#";
  }

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
    const fallback = window.GALLA_DEFAULT_AVATAR || "/assets/app-icons/default-avatar.png";
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
      <a class="np-item ${unread ? "unread" : ""}" data-id="${n.id}" data-ids="${ids}" href="${esc(linkOf(n))}">
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
    // 탭으로 먼저 가르고(활동/메시지), 그 안에서 유형 칩으로 좁힌다
    const inTab = ROWS.filter(r => (typeOf(r.type).key === "message") === (TAB === "message"));
    const rows = FILTER === "all" ? inTab : inTab.filter(r => typeOf(r.type).key === FILTER);
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
    const tabsEl = document.getElementById("npTabs");
    if (tabsEl) tabsEl.addEventListener("click", (e) => {
      const b = e.target.closest(".np-tab");
      if (!b) return;
      tabsEl.querySelectorAll(".np-tab").forEach(x => x.classList.toggle("active", x === b));
      TAB = b.dataset.tab;
      FILTER = "all";
      document.querySelectorAll(".np-chip").forEach(c => c.classList.toggle("active", c.dataset.f === "all"));
      // 메시지 탭에선 활동용 유형 칩이 의미 없다
      document.getElementById("npFilters").hidden = TAB === "message";
      render();
    });
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
