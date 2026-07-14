/* =========================================================
   notifications.js — 활동 알림 (헤더 ♥ 뱃지 + 바텀시트 드로어 + 실시간)
   - 내 콘텐츠(이슈/댓글/광장)에 대한 타인의 좋아요·공격·방어·답글·투표를 알림
   - 헤더에 #hdrNoti(♥) + #notiBadge 가 있는 페이지에서 window.initNotifications() 호출
========================================================= */
(function () {
  let ME = null;
  let CH = null;
  let unread = 0;

  function timeAgo(iso) {
    const d = (Date.now() - new Date(iso + (iso.endsWith("Z") ? "" : "Z")).getTime()) / 1000;
    if (d < 60) return "방금";
    if (d < 3600) return Math.floor(d / 60) + "분 전";
    if (d < 86400) return Math.floor(d / 3600) + "시간 전";
    return Math.floor(d / 86400) + "일 전";
  }
  function esc(s) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function icon(type) {
    if (type === "attack") return "💥";
    if (type === "defend") return "🛡";
    if (type === "support") return "💣";
    if (type === "reply" || type === "comment" || type === "plaza_comment") return "💬";
    if (type === "vote") return "🗳";
    if (type === "dislike") return "👎";
    return "👍"; // like, plaza_like
  }

  function setBadge(n) {
    unread = Math.max(0, n);
    const b = document.getElementById("notiBadge");
    if (!b) return;
    if (unread <= 0) { b.hidden = true; return; }
    b.hidden = false;
    b.textContent = unread > 99 ? "99+" : String(unread);
  }

  function ensureDrawer() {
    let d = document.getElementById("noti-drawer");
    if (d) return d;
    d = document.createElement("div");
    d.id = "noti-drawer";
    d.className = "noti-drawer";
    d.innerHTML = `
      <div class="nd-dim"></div>
      <div class="nd-sheet">
        <div class="nd-head">
          <span class="nd-title">활동 알림</span>
          <button class="nd-readall" id="ndReadAll">모두 읽음</button>
          <button class="nd-close" aria-label="닫기">✕</button>
        </div>
        <div class="nd-list" id="ndList"><div class="nd-empty">불러오는 중…</div></div>
      </div>`;
    document.body.appendChild(d);
    d.querySelector(".nd-dim").onclick = closeDrawer;
    d.querySelector(".nd-close").onclick = closeDrawer;
    d.querySelector("#ndReadAll").onclick = markAllRead;
    return d;
  }

  function rowHTML(n) {
    const nm = (n.message || "").split("님")[0] || "GA";
    return `<a class="nd-item ${n.read ? "" : "unread"}" data-id="${n.id}" href="${esc(n.link || "#")}">
      <span class="nd-ava">${esc(nm.slice(0, 2))}</span>
      <span class="nd-ic">${icon(n.type)}</span>
      <span class="nd-tx">
        <span class="nd-msg">${esc(n.message || "새 활동")}</span>
        <span class="nd-time">${timeAgo(n.created_at)}</span>
      </span>
      ${n.read ? "" : `<span class="nd-dot"></span>`}
    </a>`;
  }

  async function openDrawer() {
    const d = ensureDrawer();
    d.classList.add("open");
    window.BattleFX?.haptic?.("tap");
    const list = document.getElementById("ndList");
    const { data, error } = await window.supabaseClient
      .from("notifications")
      .select("id,type,message,link,read,created_at,from_user")
      .eq("user_id", ME)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) { list.innerHTML = `<div class="nd-empty">알림을 불러오지 못했어요.</div>`; return; }
    list.innerHTML = (data && data.length)
      ? data.map(rowHTML).join("")
      : `<div class="nd-empty">아직 활동 알림이 없어요.<br>갈라에 참여하면 반응이 여기 쌓여요!</div>`;

    // 클릭 시 개별 읽음 처리 후 이동
    list.querySelectorAll(".nd-item").forEach(el => {
      el.addEventListener("click", async (e) => {
        const id = Number(el.dataset.id);
        if (el.classList.contains("unread")) {
          el.classList.remove("unread");
          el.querySelector(".nd-dot")?.remove();
          setBadge(unread - 1);
          await window.supabaseClient.from("notifications").update({ read: true }).eq("id", id);
        }
        // href 기본 이동 허용 (링크 없으면 막기)
        if (!el.getAttribute("href") || el.getAttribute("href") === "#") e.preventDefault();
      });
    });

    // 드로어를 열면 '확인'으로 간주 → 빨간점(뱃지) 제거 + DB 읽음 처리
    // (목록의 unread 하이라이트는 이번 열람 동안 유지)
    if (unread > 0) {
      window.supabaseClient.from("notifications").update({ read: true }).eq("user_id", ME).eq("read", false);
      setBadge(0);
    }
  }
  function closeDrawer() {
    document.getElementById("noti-drawer")?.classList.remove("open");
  }

  async function markAllRead() {
    await window.supabaseClient.from("notifications").update({ read: true }).eq("user_id", ME).eq("read", false);
    document.querySelectorAll("#ndList .nd-item.unread").forEach(el => {
      el.classList.remove("unread"); el.querySelector(".nd-dot")?.remove();
    });
    setBadge(0);
  }

  async function loadUnread() {
    const { count } = await window.supabaseClient
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ME).eq("read", false);
    setBadge(count || 0);
  }

  function subscribe() {
    if (CH) window.supabaseClient.removeChannel(CH);
    CH = window.supabaseClient
      .channel("noti-" + ME)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + ME },
        (payload) => {
          setBadge(unread + 1);
          window.BattleFX?.haptic?.("tap");
          const list = document.getElementById("ndList");
          const drawer = document.getElementById("noti-drawer");
          if (list && drawer?.classList.contains("open")) {
            list.querySelector(".nd-empty")?.remove();
            list.insertAdjacentHTML("afterbegin", rowHTML(payload.new));
            const first = list.firstElementChild;
            first?.addEventListener("click", async (e) => {
              first.classList.remove("unread"); first.querySelector(".nd-dot")?.remove();
              setBadge(unread - 1);
              await window.supabaseClient.from("notifications").update({ read: true }).eq("id", payload.new.id);
              if (!first.getAttribute("href") || first.getAttribute("href") === "#") e.preventDefault();
            });
          }
        })
      .subscribe();
  }

  window.initNotifications = async function () {
    const btn = document.getElementById("hdrNoti");
    if (!btn) return;
    const { data: sess } = await window.supabaseClient.auth.getSession();
    ME = sess?.session?.user?.id || null;
    if (!ME) {
      // 비로그인: 하트 누르면 로그인 유도
      btn.addEventListener("click", () => {
        if (confirm("로그인하면 내 활동 알림을 볼 수 있어요. 로그인할까요?")) location.href = "login.html";
      });
      return;
    }
    // 인스타식: 하트를 누르면 드로어가 아니라 '알림 페이지'로 이동
    btn.addEventListener("click", () => { location.href = "notifications.html"; });
    await loadUnread();
    subscribe();
  };
})();
