/* =========================================================
   notifications.js — 헤더 ♥ 뱃지 + 유형별 요약 칩 + 실시간
   - #hdrNoti(♥) + #notiBadge 가 있는 페이지에서 window.initNotifications() 호출
   - 하트를 누르면 notifications.html 로 이동(읽음 처리는 그 페이지가 담당)
   - 숫자만 있는 뱃지는 "뭐가 왔는지"를 못 알려준다 → 인스타처럼 유형별 요약 칩을 함께 띄운다

   ※ 예전에 있던 바텀시트 드로어(ensureDrawer/openDrawer/markAllRead ~100줄)는 제거했다.
     하트가 notifications.html 로 가도록 바뀐 뒤로 단 한 번도 호출되지 않는 죽은 코드였고,
     그 안에 읽음 처리가 들어 있어서 "여기서 처리되겠지"라는 착각을 만들었다.
========================================================= */
(function () {
  let ME = null;
  let CH = null;
  let unread = 0;
  let hideTimer = null;

  /* 유형 → 요약 그룹.
     타입 정의의 원본은 js/notifications-page.js 의 TYPE 맵이다(아이콘·필터까지 거기서 관리).
     여기서는 헤더 요약용으로만 거칠게 묶는다. 맵에 없는 타입은 '기타'로 떨어지므로
     새 알림 타입이 추가돼도 이 파일을 고치지 않아 깨지지 않는다(라벨만 '기타'가 될 뿐). */
  const GROUP_OF = {
    reply: "comment", comment: "comment", plaza_comment: "comment",
    like: "like", plaza_like: "like",
    dislike: "dislike",
    follow: "follow",
    vote: "vote", plaza_vote: "vote",
    attack: "battle", defend: "battle", support: "battle",
    duel: "battle", duel_result: "battle", duel_challenge: "battle",
    duel_live: "battle", duel_voting: "battle", duel_decline: "battle",
    issue_win: "reward", donation: "reward", withdrawal: "reward",
    market_resolved: "predict",
  };
  // 표시 순서 = 아래 배열 순서(사람이 먼저 궁금해하는 것부터)
  const GROUPS = [
    { key: "comment", icon: "comment", label: "댓글" },
    { key: "like",    icon: "like",    label: "좋아요" },
    { key: "follow",  icon: "follow",  label: "팔로워" },
    { key: "battle",  icon: "swords",  label: "전투" },
    { key: "vote",    icon: "vote",    label: "투표" },
    { key: "reward",  icon: "gift",    label: "보상" },
    { key: "predict", icon: "chart",   label: "예측" },
    { key: "dislike", icon: "dislike", label: "싫어요" },
    { key: "etc",     icon: "bell",    label: "기타" },
  ];
  /* 💬 메시지(DM·삐삐)는 활동 알림과 성격이 다르다 — 읽을 곳도 DM이고,
     하트 뱃지에까지 섞이면 같은 소식이 두 군데서 두 번 카운트된다.
     → 하트(활동)에서는 빼고, DM 뱃지·삐삐 액정 팝업이 담당한다.
     알림함에서는 [메시지] 탭에서 따로 볼 수 있다. */
  const MSG_TYPES = new Set(["dm", "pager"]);
  const MAX_CHIPS = 3;   // 그 이상은 +N 으로 접는다 — 헤더가 좁아 4개부터 줄바꿈이 난다

  // 공용 SVG 아이콘(noti-icons.js) — 없으면 빈 문자열로 조용히 넘어간다
  function icon(name) { return window.GALLA_svgIcon ? window.GALLA_svgIcon(name) : ""; }

  function setBadge(n) {
    unread = Math.max(0, n);
    const b = document.getElementById("notiBadge");
    if (!b) return;
    if (unread <= 0) { b.hidden = true; return; }
    b.hidden = false;
    b.textContent = unread > 99 ? "99+" : String(unread);
  }

  function pillEl() {
    let p = document.getElementById("notiPill");
    if (p) return p;
    const btn = document.getElementById("hdrNoti");
    if (!btn) return null;
    p = document.createElement("div");
    p.id = "notiPill";
    p.className = "noti-pill";
    p.hidden = true;
    p.setAttribute("role", "status");
    // 하트 기준으로 위치를 잡아야 꼬리가 하트를 가리킨다
    btn.style.position = btn.style.position || "relative";
    btn.appendChild(p);
    p.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      location.href = "notifications.html";
    });
    return p;
  }

  /* 유형별 요약 칩 — 인스타처럼 하트 아래 빨간 알약.
     계속 떠 있으면 콘텐츠를 가리므로 잠깐 보여주고 접는다(다시 보려면 하트를 누르면 됨). */
  function renderPill(counts) {
    const p = pillEl();
    if (!p) return;
    const items = GROUPS
      .map(g => ({ ...g, n: counts[g.key] || 0 }))
      .filter(g => g.n > 0)
      .sort((a, b) => b.n - a.n);
    if (!items.length) { p.hidden = true; return; }

    const head = items.slice(0, MAX_CHIPS);
    const restN = items.slice(MAX_CHIPS).reduce((s, g) => s + g.n, 0);
    p.innerHTML = head.map(g =>
      `<span class="npi" title="${g.label}"><i>${icon(g.icon)}</i><b>${g.n > 99 ? "99+" : g.n}</b></span>`
    ).join("") + (restN ? `<span class="npi more">+${restN}</span>` : "");
    p.hidden = false;
    p.classList.remove("show");
    requestAnimationFrame(() => p.classList.add("show"));
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      p.classList.remove("show");
      setTimeout(() => { if (!p.classList.contains("show")) p.hidden = true; }, 260);
    }, 5000);
  }

  /* 안 읽은 알림을 유형까지 같이 가져와 집계.
     count만 세면 숫자밖에 못 보여준다. type만 뽑으므로 페이로드는 여전히 작다. */
  async function loadUnread() {
    const { data, error } = await window.supabaseClient
      .from("notifications")
      .select("type")
      .eq("user_id", ME)
      .eq("read", false)
      .limit(500);
    if (error) { console.error("[noti] 안읽음 조회 실패", error); return; }
    // 메시지(DM·삐삐)는 활동 알림에서 제외 — DM 뱃지가 이미 알려준다
    const rows = (data || []).filter(r => !MSG_TYPES.has(r.type));
    const counts = {};
    rows.forEach(r => {
      const k = GROUP_OF[r.type] || "etc";
      counts[k] = (counts[k] || 0) + 1;
    });
    setBadge(rows.length);
    if (rows.length) renderPill(counts);
    else { const p = document.getElementById("notiPill"); if (p) p.hidden = true; }
  }
  // 알림 페이지에서 읽음 처리한 뒤 헤더를 즉시 갱신하려고 노출
  window.GALLA_notiRefresh = () => { if (ME) loadUnread(); };

  function subscribe() {
    if (CH) window.supabaseClient.removeChannel(CH);
    CH = window.supabaseClient
      .channel("noti-" + ME)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + ME },
        () => {
          window.BattleFX?.haptic?.("tap");
          loadUnread();   // 새 알림의 유형까지 반영해야 하므로 다시 집계한다
        })
      .subscribe();
  }

  window.initNotifications = async function () {
    const btn = document.getElementById("hdrNoti");
    if (!btn) return;
    const { data: sess } = await window.supabaseClient.auth.getSession();
    ME = sess?.session?.user?.id || null;
    if (!ME) {
      btn.addEventListener("click", () => {
        if (confirm("로그인하면 내 활동 알림을 볼 수 있어요. 로그인할까요?")) location.href = "login.html";
      });
      return;
    }
    btn.addEventListener("click", () => { location.href = "notifications.html"; });
    await loadUnread();
    subscribe();

    // 알림 페이지를 보고 '뒤로가기'로 돌아오면 bfcache 복원이라 스크립트가 다시 돌지 않는다
    // → 이미 읽은 뱃지가 그대로 남아 "확인했는데 또 안 읽음"으로 보인다. 복원 시 다시 집계.
    window.addEventListener("pageshow", (e) => { if (e.persisted && ME) loadUnread(); });
  };
})();
