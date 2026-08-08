/* 🎟 갈라 이용권 — 내 등급·잔여 대화·리셋 시각을 보여주고, 웹에서는 업그레이드까지 안내한다.
   데이터는 서버 RPC my_entitlement 하나(등급·한도·사용량·플랜표가 전부 여기 담겨 온다).

   ⚠️ 앱스토어 심사(anti-steering): 네이티브 앱 안에서는 **가격·결제 버튼·웹 결제 유도 문구를
      일절 노출하지 않는다.** IAP가 붙기 전까지 네이티브는 '내 이용권 현황'만 보여준다.
      (문구로 웹 결제를 암시하는 것도 금지 — "웹에서 결제하세요" 같은 말 절대 금지) */
(function () {
  "use strict";
  if (window.__gallaPlans) return; window.__gallaPlans = true;

  function isNativeApp() {
    try {
      if (/GallaApp/i.test(navigator.userAgent)) return true;
      if (window.GALLA_isApp && window.GALLA_isApp()) return true;
      if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) return true;
    } catch (e) {}
    return false;
  }

  var ORDER = ["free", "lite", "friend", "pro"];
  var PITCH = {
    free:   "가볍게 써보기",
    lite:   "매일 수다 떨기",
    friend: "만들기 시작하는 사람",
    pro:    "본격적으로 만드는 사람"
  };
  var FEAT_LABEL = {
    memory: "나를 기억함",
    voice: "리얼보이스",
    no_ads: "광고 없음",
    craft_thumbnail: "썸네일 생성",
    craft_titles: "제목 뽑기",
    craft_script: "대본 작성",
    craft_video: "숏폼 자동편집",
    priority: "우선 처리"
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function won(n) { return Number(n || 0).toLocaleString("ko-KR") + "원"; }

  /* 리셋 시각은 '몇 시 몇 분'으로 — "잠시 후"처럼 뭉개면 유저가 언제 돌아올지 모른다. */
  function resetText(iso) {
    if (!iso) return "";
    var t = new Date(iso);
    if (isNaN(t)) return "";
    var mins = Math.round((t - Date.now()) / 60000);
    if (mins <= 0) return "곧 다시 열려요";
    var hhmm = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Seoul" }).format(t);
    return mins < 60 ? (mins + "분 뒤(" + hhmm + ")에 다시 열려요") : (hhmm + "에 다시 열려요");
  }

  var _cache = null, _cacheAt = 0;
  async function fetchEnt(force) {
    if (!force && _cache && Date.now() - _cacheAt < 20000) return _cache;
    try {
      var sb = window.supabaseClient;
      if (!sb) return null;
      var s = await sb.auth.getSession();
      if (!s || !s.data || !s.data.session) return { tier: "guest" };   // 비로그인
      var r = await sb.rpc("my_entitlement", { p_fn: "galla-friend" });
      if (r.error) return null;
      _cache = r.data; _cacheAt = Date.now();
      return _cache;
    } catch (e) { return null; }
  }
  window.GALLA_entitlement = fetchEnt;

  function injectStyle() {
    if (document.getElementById("gpl-style")) return;
    var s = document.createElement("style"); s.id = "gpl-style";
    s.textContent = [
      ".gpl-scrim{position:fixed;inset:0;background:rgba(0,0,0,.66);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);",
      "z-index:10090;display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .2s}",
      ".gpl-scrim.on{opacity:1}",
      "@media(min-width:821px){.gpl-scrim{align-items:center}}",
      ".gpl{width:100%;max-width:440px;max-height:88vh;overflow:auto;background:#0f1116;color:#fff;border:1px solid #232733;",
      "border-radius:22px 22px 0 0;padding:22px 18px calc(22px + env(safe-area-inset-bottom));position:relative;",
      "transform:translateY(0);transition:transform .26s cubic-bezier(.2,.8,.2,1)}",
      ".gpl-scrim .gpl.gpl-enter{transform:translateY(26px)}",
      "@media(min-width:821px){.gpl{border-radius:22px;margin:20px}}",
      ".gpl-x{position:absolute;top:14px;right:14px;width:32px;height:32px;border:0;background:#1b1f27;color:#9aa3b3;border-radius:50%;font-size:19px;cursor:pointer}",
      ".gpl-h{font-size:20px;font-weight:800;margin:2px 0 14px;letter-spacing:-.3px}",
      ".gpl-now{background:#141821;border:1px solid #242a36;border-radius:16px;padding:15px 16px;margin-bottom:16px}",
      ".gpl-now-t{display:flex;align-items:center;gap:8px;font-size:13px;color:#8f98a8;margin-bottom:9px}",
      ".gpl-badge{padding:3px 10px;border-radius:999px;background:#2a3350;color:#a8bcff;font-size:11.5px;font-weight:800}",
      ".gpl-bar{height:7px;border-radius:999px;background:#232833;overflow:hidden;margin:9px 0 7px}",
      ".gpl-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#5b7cfa,#7a5bfa)}",
      ".gpl-bar.low i{background:linear-gradient(90deg,#ff8a5b,#ff5b7c)}",
      ".gpl-cnt{font-size:15px;font-weight:800}",
      ".gpl-sub{font-size:12.5px;color:#8f98a8;margin-top:3px}",
      ".gpl-card{border:1px solid #242a36;border-radius:16px;padding:14px 15px;margin-bottom:10px;background:#12151d}",
      ".gpl-card.cur{border-color:#3d5bd0;background:#141a2b}",
      ".gpl-card-h{display:flex;align-items:baseline;gap:8px;margin-bottom:3px}",
      ".gpl-name{font-size:16px;font-weight:800}",
      ".gpl-price{margin-left:auto;font-size:15px;font-weight:800;color:#cbd3e2}",
      ".gpl-pitch{font-size:12.5px;color:#8f98a8;margin-bottom:9px}",
      ".gpl-feats{display:flex;flex-wrap:wrap;gap:6px}",
      ".gpl-f{font-size:11.5px;padding:4px 9px;border-radius:8px;background:#1a1f2a;color:#b9c2d2}",
      ".gpl-go{display:block;width:100%;margin-top:11px;padding:12px;border:0;border-radius:12px;cursor:pointer;",
      "background:linear-gradient(135deg,#4361ff,#6d5bff);color:#fff;font-size:14.5px;font-weight:800}",
      ".gpl-note{font-size:12px;color:#7d8798;line-height:1.6;margin-top:12px;text-align:center}",
      ".gpl-pill{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;",
      "background:rgba(255,255,255,.08);color:#cfd6e4;font-size:11.5px;font-weight:700;border:0;cursor:pointer}",
      ".gpl-pill.low{background:rgba(255,120,90,.18);color:#ffb098}"
    ].join("");
    document.head.appendChild(s);
  }

  function planCard(key, plan, curTier, native) {
    var cur = key === curTier;
    var feats = (plan.features || []).map(function (f) {
      return FEAT_LABEL[f] ? '<span class="gpl-f">' + esc(FEAT_LABEL[f]) + "</span>" : "";
    }).join("");
    var chat = (plan.windows && plan.windows["galla-friend"]) || {};
    var chatLine = chat.n ? ('<span class="gpl-f">' + chat.n + "턴 / " + chat.hours + "시간</span>") : "";
    // 🍎 네이티브: 가격도 결제 버튼도 노출하지 않는다(앱스토어 anti-steering)
    var price = native ? "" : '<span class="gpl-price">' + (plan.price ? won(plan.price) + "/월" : "무료") + "</span>";
    var cta = (!native && !cur && plan.price)
      ? '<button class="gpl-go" data-plan="' + esc(key) + '">' + esc(plan.label) + " 시작하기</button>" : "";
    return '<div class="gpl-card' + (cur ? " cur" : "") + '">' +
      '<div class="gpl-card-h"><span class="gpl-name">' + esc(plan.label || key) + "</span>" +
      (cur ? '<span class="gpl-badge">이용 중</span>' : "") + price + "</div>" +
      '<div class="gpl-pitch">' + esc(PITCH[key] || "") + "</div>" +
      '<div class="gpl-feats">' + chatLine + feats + "</div>" + cta + "</div>";
  }

  window.GALLA_openPlans = async function () {
    injectStyle();
    var native = isNativeApp();
    var ent = await fetchEnt(true);

    var body;
    if (!ent || ent.tier === "guest") {
      body = '<div class="gpl-now"><div class="gpl-now-t">지금은 <b style="color:#fff">맛보기</b>로 쓰는 중</div>' +
        '<div class="gpl-sub">로그인하면 갈비스가 나를 기억하고, 대화도 훨씬 넉넉해져요.</div></div>' +
        '<button class="gpl-go" data-login="1">로그인하고 시작하기</button>';
    } else {
      var lim = Number(ent.limit), used = Number(ent.used || 0);
      var unlimited = !(lim >= 0);
      var remain = unlimited ? -1 : Math.max(lim - used, 0);
      var pct = unlimited ? 0 : Math.min(100, Math.round(used / Math.max(lim, 1) * 100));
      var low = !unlimited && remain <= Math.max(1, Math.round(lim * 0.2));
      var plans = ent.plans || {};
      var cards = ORDER.filter(function (k) { return plans[k]; })
        .map(function (k) { return planCard(k, plans[k], ent.tier, native); }).join("");

      body =
        '<div class="gpl-now">' +
          '<div class="gpl-now-t">현재 <span class="gpl-badge">' + esc(ent.label || ent.tier) + "</span></div>" +
          (unlimited ? '<div class="gpl-cnt">대화 제한 없음</div>'
            : '<div class="gpl-cnt">남은 대화 ' + remain + "<span style=\"color:#7d8798;font-weight:600\"> / " + lim + "턴</span></div>" +
              '<div class="gpl-bar' + (low ? " low" : "") + '"><i style="width:' + pct + '%"></i></div>' +
              '<div class="gpl-sub">' + esc(ent.hours ? (ent.hours + "시간마다 새로 채워져요") : "") +
              (ent.resets_at && remain === 0 ? " · " + esc(resetText(ent.resets_at)) : "") + "</div>") +
          (ent.expires_at ? '<div class="gpl-sub">이용권 만료 ' +
            esc(new Date(ent.expires_at).toLocaleDateString("ko-KR")) + "</div>" : "") +
        "</div>" + cards +
        (native
          ? '<div class="gpl-note">이용권 변경은 준비 중이에요.</div>'
          : '<div class="gpl-note">언제든 해지할 수 있어요. 남은 기간은 그대로 쓸 수 있어요.</div>');
    }

    var scrim = document.createElement("div");
    scrim.className = "gpl-scrim";
    scrim.innerHTML = '<div class="gpl gpl-enter" role="dialog" aria-label="이용권">' +
      '<button class="gpl-x" aria-label="닫기">×</button>' +
      '<h3 class="gpl-h">이용권</h3>' + body + "</div>";
    document.body.appendChild(scrim);
    // rAF는 백그라운드 탭에서 멈춰 시트가 갇힌다 → setTimeout으로 등장 효과만 얹는다.
    setTimeout(function () {
      scrim.classList.add("on");
      var p = scrim.querySelector(".gpl"); if (p) p.classList.remove("gpl-enter");
    }, 20);

    function bye() { scrim.classList.remove("on"); setTimeout(function () { scrim.remove(); }, 220); }
    scrim.addEventListener("click", function (e) { if (e.target === scrim) bye(); });
    scrim.querySelector(".gpl-x").addEventListener("click", bye);

    var lg = scrim.querySelector("[data-login]");
    if (lg) lg.addEventListener("click", function () {
      location.href = "login.html?next=" + encodeURIComponent(location.pathname + location.search);
    });
    scrim.querySelectorAll("[data-plan]").forEach(function (b) {
      b.addEventListener("click", function () {
        // 결제 연동 전 — 없는 기능을 있는 척하지 않는다. 준비되면 여기서 PG로 넘긴다.
        if (window.GALLA_startCheckout) { window.GALLA_startCheckout(b.dataset.plan); return; }
        b.disabled = true; b.textContent = "곧 열려요 — 조금만 기다려주세요";
      });
    });
  };

  /* 🔢 잔여 대화 pill — 갈비스 헤더 등에 붙여 쓴다. 탭하면 이용권 시트. */
  window.GALLA_planPill = async function (mount) {
    if (!mount) return null;
    var ent = await fetchEnt();
    if (!ent || ent.tier === "guest") return null;
    var lim = Number(ent.limit), used = Number(ent.used || 0);
    if (!(lim >= 0)) return null;                       // 제한 없음이면 굳이 표시하지 않는다
    var remain = Math.max(lim - used, 0);
    injectStyle();
    var b = document.createElement("button");
    b.className = "gpl-pill" + (remain <= Math.max(1, Math.round(lim * 0.2)) ? " low" : "");
    b.type = "button";
    b.textContent = "💬 " + remain;
    b.title = "남은 대화 " + remain + "턴";
    b.addEventListener("click", function (e) { e.stopPropagation(); window.GALLA_openPlans(); });
    mount.appendChild(b);
    return b;
  };
})();
