/* 로그인 기록 — '지금 들어와 있는 기기' + '지난 로그인'.
 *
 * ⚠️ 이 화면은 계정 탈취를 알아채는 유일한 창구다. 그런데 2026-08-30 까지
 *    login_logs 에 쓰는 코드가 프론트·엣지함수·DB 어디에도 없어 전 유저에게
 *    영원히 "로그인 기록이 없습니다"만 떴다(실측: 테이블 전체 0행).
 *    이제 js/supabase.js 가 SIGNED_IN 때 log_login RPC 로 남긴다.
 *
 * 🔒 login_logs 는 authenticated 에게 SELECT 만 있다. INSERT 는 log_login RPC 로만,
 *    UPDATE/DELETE 는 아무에게도 없다 — 침입자가 흔적을 지울 수 없어야 의미가 있다.
 */
(function () {
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* 긴 UA 를 사람이 읽는 기기 이름으로. 못 알아보면 원문을 그대로 둔다(숨기지 않는다). */
  function device(ua) {
    var u = String(ua || "");
    if (!u) return "알 수 없는 기기";
    var app = /GallaApp/i.test(u) ? "갈라 앱" : null;
    var os =
      /Android/i.test(u) ? "안드로이드" :
      /iPhone/i.test(u) ? "아이폰" :
      /iPad/i.test(u) ? "아이패드" :
      /Mac OS X|Macintosh/i.test(u) ? "맥" :
      /Windows/i.test(u) ? "윈도우" :
      /Linux/i.test(u) ? "리눅스" : null;
    var br =
      /Edg\//i.test(u) ? "엣지" :
      /OPR\/|Opera/i.test(u) ? "오페라" :
      /SamsungBrowser/i.test(u) ? "삼성 인터넷" :
      /Firefox\//i.test(u) ? "파이어폭스" :
      /Chrome\//i.test(u) ? "크롬" :
      /Safari\//i.test(u) ? "사파리" : null;
    var parts = [os, app || br].filter(Boolean);
    return parts.length ? parts.join(" · ") : u.slice(0, 60);
  }

  function when(iso) {
    /* created_at 은 timestamptz 다. 예전엔 무TZ라 브라우저가 로컬로 오해해 9시간 어긋났다. */
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
  }

  function card(title, sub, meta, live) {
    return '<div class="log-card">' +
      '<div class="log-date">' + esc(meta) + (live ? ' · <span style="color:#7dd87d">지금 접속 중</span>' : "") + "</div>" +
      '<div class="log-agent">' + esc(title) + "</div>" +
      (sub ? '<div class="log-date" style="margin:4px 0 0">' + esc(sub) + "</div>" : "") +
      "</div>";
  }

  async function render(root) {
    var listEl = (root && root.querySelector)
      ? root.querySelector("#logList")
      : document.getElementById("logList");
    if (!listEl) return;

    var supabase = window.supabaseClient;
    if (!supabase) {
      supabase = await new Promise(function (res) {
        var n = 0;
        var t = setInterval(function () {
          if (window.supabaseClient) { clearInterval(t); res(window.supabaseClient); }
          else if (++n > 250) { clearInterval(t); res(null); }      // 5초면 포기 — 무한 대기 금지
        }, 20);
      });
    }
    if (!supabase) { listEl.innerHTML = '<div style="color:#777">불러오기 실패</div>'; return; }

    var s = await supabase.auth.getSession();
    var user = s && s.data && s.data.session && s.data.session.user;
    if (!user) {
      listEl.innerHTML = '<div style="color:#777">로그인이 필요해요.</div>';
      return;
    }

    /* 둘 다 실패해도 화면은 남긴다 — 한쪽이 죽었다고 백지로 만들지 않는다. */
    var live = [], hist = [];
    try {
      var a = await supabase.rpc("my_sessions");
      if (!a.error && a.data) live = a.data;
    } catch (e) {}
    try {
      var b = await supabase
        .from("login_logs")
        .select("created_at, user_agent")
        .order("created_at", { ascending: false })
        .limit(20);
      if (!b.error && b.data) hist = b.data;
    } catch (e) {}

    var html = "";
    html += '<div class="log-date" style="margin:0 0 10px">지금 로그인된 기기 ' + live.length + "대</div>";
    if (!live.length) {
      html += '<div style="color:#777;margin-bottom:20px">표시할 기기가 없어요.</div>';
    } else {
      live.forEach(function (r) { html += card(device(r.ua), r.ip || "", when(r.at), true); });
    }

    html += '<div class="log-date" style="margin:22px 0 10px">지난 로그인</div>';
    if (!hist.length) {
      html += '<div style="color:#777">아직 쌓인 기록이 없어요. 다음 로그인부터 남아요.</div>';
    } else {
      hist.forEach(function (r) { html += card(device(r.user_agent), "", when(r.created_at), false); });
    }

    html += '<div class="log-date" style="margin:22px 0 0;line-height:1.6">' +
      '모르는 기기가 보이면 비밀번호를 바꿔주세요. 이 기록은 지우거나 고칠 수 없어요.</div>';

    listEl.innerHTML = html;
  }

  /* SPA(앱)에서는 DOMContentLoaded 가 이미 지나 있다 — 어댑터가 mount 로 부른다. */
  window.GALLA_PAGE_LOGIN_HISTORY = { mount: function (root) { render(root); } };

  /* ⚠️ 반드시 DOMContentLoaded 로 '등록'한다. SPA 로더가 이 등록을 가로채 보관했다가
     방문할 때마다 다시 부르는 구조다(view-loader.loadPageScripts). 즉시 render() 를
     부르면 1차 방문만 되고 재방문 때 아무것도 안 돈다 — 실측으로 확인했다. */
  document.addEventListener("DOMContentLoaded", function () { render(document); });
  /* MPA 에서 스크립트가 DCL 이후에 실행된 경우의 보험. SPA 는 로더가 책임지므로 건너뛴다. */
  if (!window.GALLA_SPA_LOADER && document.readyState !== "loading") render(document);
})();
