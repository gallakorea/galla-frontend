/* =========================================================
   🚪 첫 진입 온보딩 — 초대/검색으로 들어온 사람을 10초 안에 '참전'시킨다.
   원칙: 설명 대신 즉시 선택. 로그인 전에 먼저 편을 고르게 하고(약속),
        그 선택을 저장해뒀다가 로그인 직후 자동으로 투표로 확정한다.
   - 최초 1회만 (localStorage galla_onboarded)
   - 오늘 최대 격전 이슈를 미끼로 → 찬성/반대 탭 → 로그인 유도 or 즉시 투표
   - 실패해도 조용히 사라짐(앱 진입을 절대 막지 않음)
   ========================================================= */
(function () {
  var DONE = "galla_onboarded";
  var PEND = "galla_pending_vote";   // {issue_id, type}
  if (document.body.dataset.page !== "index") return;

  function sbReady() {
    return window.waitForSupabaseClient ? waitForSupabaseClient() : Promise.resolve(window.supabaseClient);
  }

  /* ── 로그인 후 보류 투표 자동 확정 (온보딩에서 고른 편) ── */
  (async function applyPending() {
    var raw; try { raw = localStorage.getItem(PEND); } catch (e) { return; }
    if (!raw) return;
    try {
      var p = JSON.parse(raw);
      var sb = await sbReady();
      var s = await sb.auth.getSession();
      if (!s.data?.session) return;                       // 아직 로그인 전 → 보류 유지
      await sb.from("votes").insert({ issue_id: p.issue_id, user_id: s.data.session.user.id, type: p.type });
    } catch (e) { /* 이미 투표했거나 실패 — 무시 */ }
    try { localStorage.removeItem(PEND); } catch (e) {}
  })();

  /* ── 온보딩 본체 ── */
  (async function run() {
    try { if (localStorage.getItem(DONE)) return; } catch (e) { return; }
    // 🚫 가입 직후(이메일 인증 대기)면 온보딩 금지 — 가입 흐름을 끊고 signup으로 되돌리는 루프 방지.
    try { if (localStorage.getItem("galla_fresh_signup")) return; } catch (e) {}

    var sb = await sbReady();
    // 오늘 최대 격전 이슈
    var r = await sb.from("issues").select("id,title,faction_a,faction_b,thumbnail_url,images")
      .eq("status", "normal").order("hot_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }).limit(1);
    var iss = r.data && r.data[0];
    if (!iss) return;                                     // 콘텐츠 없으면 온보딩 생략

    var s = await sb.auth.getSession();
    var loggedIn = !!s.data?.session;
    var A = iss.faction_a || "찬성이오";
    var B = iss.faction_b || "난 반댈세";
    var img = iss.thumbnail_url || (Array.isArray(iss.images) && iss.images[0]) || "/assets/og/og-default.png";

    // 🚫 비동기 조회 사이에 메인 투어(tour.js)가 떠서 galla_onboarded를 세팅했으면 중복 노출 금지(레이스 차단).
    try { if (localStorage.getItem(DONE) || localStorage.getItem("galla_tour_v2")) return; } catch (e) {}

    css();
    var ov = document.createElement("div");
    ov.className = "obd";
    ov.innerHTML =
      '<div class="obd-card">' +
        '<button class="obd-x" aria-label="닫기">✕</button>' +
        '<div class="obd-kicker">🔥 지금 대한민국 최대 격전</div>' +
        '<div class="obd-thumb" style="background-image:url(\'' + esc(img) + '\')"></div>' +
        '<h2 class="obd-q">' + esc(iss.title) + '</h2>' +
        '<div class="obd-ask">당신은 어느 편입니까?</div>' +
        '<div class="obd-btns">' +
          '<button class="obd-side pro" data-t="pro"><b>👍 ' + esc(A) + '</b></button>' +
          '<button class="obd-side con" data-t="con"><b>👎 ' + esc(B) + '</b></button>' +
        '</div>' +
        '<div class="obd-note">' + (loggedIn ? "선택하면 바로 참전합니다" : "선택하면 가입 후 자동으로 참전 처리돼요") + '</div>' +
      '</div>';
    document.body.appendChild(ov);
    requestAnimationFrame(function () { ov.classList.add("show"); });
    // ✅ 뜨는 즉시 '봤음' 표시 — 선택/닫기 안 하고 나가도 다시는 안 뜬다.
    try { localStorage.setItem(DONE, "1"); } catch (e) {}

    function finish() {
      try { localStorage.setItem(DONE, "1"); } catch (e) {}
      ov.classList.remove("show");
      setTimeout(function () { ov.remove(); }, 320);
    }
    ov.querySelector(".obd-x").onclick = finish;
    ov.addEventListener("click", function (e) { if (e.target === ov) finish(); });

    ov.querySelectorAll(".obd-side").forEach(function (btn) {
      btn.onclick = async function () {
        var type = btn.dataset.t;
        ov.querySelectorAll(".obd-side").forEach(function (b) { b.disabled = true; });
        btn.classList.add("picked");
        try { localStorage.setItem(DONE, "1"); } catch (e) {}

        if (loggedIn) {
          try {
            await sb.from("votes").insert({ issue_id: iss.id, user_id: s.data.session.user.id, type: type });
          } catch (e) {}
          btn.querySelector("b").textContent = "⚔️ 참전 완료!";
          setTimeout(function () { location.href = "issue.html?id=" + iss.id; }, 700);
        } else {
          // 로그인 전 선택 → 보류 저장 후 가입으로. 로그인 직후 위 applyPending()이 확정.
          try { localStorage.setItem(PEND, JSON.stringify({ issue_id: iss.id, type: type })); } catch (e) {}
          btn.querySelector("b").textContent = "✓ 선택됨";
          setTimeout(function () { (window.GALLA_nav||function(u){location.href=u})("signup.html"); }, 550);
        }
      };
    });
  })();

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function css() {
    if (document.getElementById("obd-css")) return;
    var st = document.createElement("style"); st.id = "obd-css";
    st.textContent =
      ".obd{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;padding:18px;" +
        "background:rgba(0,0,0,.82);backdrop-filter:blur(6px);opacity:0;transition:opacity .3s}" +
      ".obd.show{opacity:1}" +
      ".obd-card{position:relative;width:100%;max-width:420px;border-radius:20px;padding:20px;text-align:center;" +
        "background:linear-gradient(160deg,#151824,#0c0d13);border:1px solid rgba(255,255,255,.10);" +
        "box-shadow:0 30px 80px rgba(0,0,0,.6);transform:translateY(18px) scale(.97);transition:transform .34s cubic-bezier(.2,.9,.3,1)}" +
      ".obd.show .obd-card{transform:none}" +
      ".obd-x{position:absolute;top:10px;right:12px;background:none;border:0;color:#6b7488;font-size:16px;cursor:pointer;padding:6px}" +
      ".obd-kicker{font-size:12px;font-weight:800;color:#ff8a3d;letter-spacing:.3px;margin-bottom:12px}" +
      ".obd-thumb{width:100%;height:140px;border-radius:13px;background:#22252f center/cover no-repeat;margin-bottom:14px}" +
      ".obd-q{font-size:18px;font-weight:900;color:#fff;line-height:1.4;letter-spacing:-.3px;margin:0 0 14px}" +
      ".obd-ask{font-size:13px;color:#9aa3b5;margin-bottom:12px}" +
      ".obd-btns{display:grid;grid-template-columns:1fr 1fr;gap:10px}" +
      ".obd-side{padding:15px 8px;border-radius:12px;border:1px solid rgba(255,255,255,.14);cursor:pointer;" +
        "background:#191d26;color:#e6ebf5;font-size:13.5px;transition:.15s;min-width:0}" +
      ".obd-side b{display:block;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".obd-side.pro:hover,.obd-side.pro.picked{background:rgba(61,107,255,.22);border-color:#3d6bff}" +
      ".obd-side.con:hover,.obd-side.con.picked{background:rgba(255,77,103,.22);border-color:#ff4d67}" +
      ".obd-side:disabled{opacity:.65}" +
      ".obd-side.picked{opacity:1}" +
      ".obd-note{margin-top:12px;font-size:11.5px;color:#6b7488}" +
      "@media (prefers-reduced-motion:reduce){.obd,.obd-card{transition:none}}";
    document.head.appendChild(st);
  }
})();
