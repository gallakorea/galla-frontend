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

  /* ⚠️ 이용권 키는 서버(app_settings.ai_tiers)가 진실이다. 여기 목록은 '보여줄 순서'일 뿐인데,
     2026-08-26 개명(라이트/프렌드/프로 → 컴패니언) 때 이걸 안 고쳐서 카드가 통째로 안 나왔다.
     서버에서 온 plans 에만 있고 여기 없는 키도 뒤에 붙여 렌더한다 — 다시는 통째로 사라지지 않게. */
  /* 2026-09-08 에 4티어 → 2티어로 줄였다(`docs/appstore-products.md`).
     `companion_sometimes`(999원)는 스토어 사다리에 999원이 없어 1,100원이 되면 「매일」과 800원 차이였고,
     `companion_plus`(3,400원)는 대화 한도가 「매일」과 똑같아 더 낼 이유가 없었다.
     서버 ai_tiers·sub_products 에서 이미 빠졌으므로 목록에서도 지운다. */
  var ORDER = ["free", "companion_daily", "companion_always", "companion_soul"];
  var PITCH = {
    free:                "가볍게 써보기",
    companion_daily:     "매일 수다 떨기",
    companion_always:    "종일 붙어 있기",
    companion_soul:      "끝까지 함께"
  };
  var FEAT_LABEL = {
    memory: "나를 기억함",
    voice: "리얼보이스",
    no_ads: "광고 없음",
    craft_thumbnail: "썸네일 생성",
    craft_titles: "제목 뽑기",
    craft_script: "대본 작성",
    craft_video: "숏폼 자동편집",
    app_control: "앱 대신 조작",
    priority: "우선 처리"
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function won(n) { return Number(n || 0).toLocaleString("ko-KR") + "원"; }

  /* 📅 'YYYY-MM-DD' → '9월 30일'. Date 로 파싱하면 UTC 로 읽혀 하루 밀린다 — 글자로 자른다. */
  function mdText(d) {
    var p = String(d || "").slice(0, 10).split("-");
    return p.length === 3 ? Number(p[1]) + "월 " + Number(p[2]) + "일" : "";
  }

  /* ⬆️ 바로 위 등급 — ORDER 순서. 맨 위(소울메이트)면 null. plans 를 주면 서버에 있는 등급만 고른다. */
  function nextTier(cur, plans) {
    var i = ORDER.indexOf(cur);
    if (i < 0) return null;
    for (var j = i + 1; j < ORDER.length; j++) {
      if (!plans || plans[ORDER[j]]) return ORDER[j];
    }
    return null;
  }
  window.GALLA_planNext = function (tier) { return nextTier(tier, null); };

  /* 🛒 지금 실제로 살 수 있나 — 앱은 스토어에 상품이 떠 있어야, 웹은 결제가 연결돼 있어야.
     못 사는 등급을 '추천'하면 눌러도 안 되는 버튼으로 보내는 꼴이다. */
  function buyable(key) {
    if (!key) return false;
    if (isNativeApp()) {
      try { return (window.GALLA_subOffers ? window.GALLA_subOffers() : []).some(function (o) { return o.tier === key; }); }
      catch (_) { return false; }
    }
    return !!window.GALLA_startCheckout;
  }

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
      /* 🗓 5시간 창은 '지금 몇 번 남았나'고, 사람이 궁금한 건 '이번 달 얼마나 썼나'다.
         대화와 앱 조작은 원가가 23배 차이라 따로 센다(2026-08-26 실측) — 두 줄로 보여준다.
         ⚠️ 실패해도 시트는 열려야 한다. 월 현황은 없으면 그 줄만 빠진다. */
      var m = null;
      try { var mr = await sb.rpc("companion_usage"); if (!mr.error) m = mr.data; } catch (e) { /* 없으면 생략 */ }
      _cache = Object.assign({}, r.data, { month: (m && m.ok) ? m : null });
      _cacheAt = Date.now();
      return _cache;
    } catch (e) { return null; }
  }
  window.GALLA_entitlement = fetchEnt;
  /* 20초 캐시를 즉시 버린다. 한 턴 끝난 직후 pill 을 다시 그릴 때 쓴다 —
     fetchEnt(true) 를 await 없이 부르면 pill 이 옛 캐시를 먼저 읽어 숫자가 안 바뀐다. */
  window.GALLA_entitlementBust = function () { _cache = null; _cacheAt = 0; };

  function injectStyle() {
    if (document.getElementById("gpl-style")) return;
    var s = document.createElement("style"); s.id = "gpl-style";
    s.textContent = [
      ".gpl-scrim{position:fixed;inset:0;background:rgba(0,0,0,.66);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);",
      "z-index:10090;display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .2s}",
      ".gpl-scrim.on{opacity:1}",
      ".gpl-mrow{display:flex;gap:10px;margin-top:10px}",
      ".gpl-m{flex:1;min-width:0}",
      ".gpl-m>span{display:block;font-size:11.5px;color:#7d8798}",
      ".gpl-m>b{display:block;font-size:15px;font-weight:800;color:#f3f4f6;margin-top:1px}",
      ".gpl-m>b>i{font-style:normal;font-size:11.5px;color:#7d8798;font-weight:600}",
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
      ".gpl-alert{border-radius:14px;padding:12px 14px;margin-bottom:12px;background:#1f1a12;border:1px solid #4a3a1c}",
      ".gpl-alert b{display:block;font-size:14px;font-weight:800;color:#ffd08a;margin-bottom:3px}",
      ".gpl-alert span{display:block;font-size:12.5px;color:#c7b9a0;line-height:1.55}",
      ".gpl-alert.over{background:#241418;border-color:#5a2632}",
      ".gpl-alert.over b{color:#ff9fac}",
      ".gpl-bline{display:flex;justify-content:space-between;align-items:baseline;font-size:12.5px;color:#8f98a8;margin-top:13px}",
      ".gpl-bline b{font-size:13px;color:#f3f4f6;font-weight:800}",
      ".gpl-card.rec{border-color:#7a5bfa;background:#161430}",
      ".gpl-badge.rec{background:#3a2d6e;color:#cdbdff}",
      ".gpl-pill{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;",
      "background:rgba(255,255,255,.08);color:#cfd6e4;font-size:11.5px;font-weight:700;border:0;cursor:pointer}",
      ".gpl-pill.low{background:rgba(255,120,90,.18);color:#ffb098}"
    ].join("");
    document.head.appendChild(s);
  }

  var OFFERS = {};

  function planCard(key, plan, curTier, native, rec) {
    var cur = key === curTier;
    var feats = (plan.features || []).map(function (f) {
      return FEAT_LABEL[f] ? '<span class="gpl-f">' + esc(FEAT_LABEL[f]) + "</span>" : "";
    }).join("");
    /* ⚠️ 화면에 보이는 숫자와 실제로 막는 숫자가 같아야 한다.
       실제로 막는 건 5시간 창이다(ai_gate). 월 한도는 아무도 안 막으므로 보여주지 않는다 —
       보이는 것과 겪는 것이 다른 게 제일 나쁘다. 조작만 월 한도가 진짜다(대화보다 23배 비싸서). */
    var w = (plan.windows && plan.windows["galla-friend"]) || {};
    var chatLine =
      (w.n ? '<span class="gpl-f">대화 ' + w.n + "턴 / " + (w.hours || 5) + "시간</span>" : "") +
      (plan.tool_turns ? '<span class="gpl-f">앱 조작 월 ' + plan.tool_turns + "턴</span>" : "");
    /* 💳 가격·결제 버튼
       · 웹: 우리 원화 정가.
       · 앱: **스토어가 준 표시가만** 쓴다. 우리가 ₩ 를 적으면 통화·세율·지역이 어긋나고
         심사에서도 걸린다. 상품이 스토어에 아직 없으면 가격이 안 오는데, 그때는
         버튼도 안 띄운다 — 눌러도 안 되는 결제 버튼은 그냥 이탈이다.
       · 앱에서 스토어 가격을 보여주는 건 anti-steering 위반이 아니다. 걸리는 건
         '앱 밖에서 더 싸게 사라'는 유도다. 우리는 인앱 결제로 보낸다. */
    var offer = native ? OFFERS[key] : null;
    var price = native
      ? (offer ? '<span class="gpl-price">' + esc(offer.price) + "/월</span>" : "")
      : '<span class="gpl-price">' + (plan.price ? won(plan.price) + "/월" : "무료") + "</span>";
    var cta = cur ? ""
      : native
        ? (offer ? '<button class="gpl-go" data-buy="' + esc(key) + '">' + esc(plan.label) + " 시작하기</button>" : "")
        : (plan.price ? '<button class="gpl-go" data-plan="' + esc(key) + '">' + esc(plan.label) + " 시작하기</button>" : "");
    return '<div class="gpl-card' + (cur ? " cur" : "") + (rec ? " rec" : "") + '">' +
      '<div class="gpl-card-h"><span class="gpl-name">' + esc(plan.label || key) + "</span>" +
      (cur ? '<span class="gpl-badge">이용 중</span>' : "") + (rec ? '<span class="gpl-badge rec">추천</span>' : "") + price + "</div>" +
      '<div class="gpl-pitch">' + esc(PITCH[key] || "") + "</div>" +
      '<div class="gpl-feats">' + chatLine + feats + "</div>" + cta + "</div>";
  }

  /* opts.reason — "budget"(주기 대화량 소진으로 막힘) · "nudge"(80% 안내). 클릭 이벤트가 들어와도 무시된다. */
  window.GALLA_openPlans = async function (opts) {
    var reason = opts && typeof opts.reason === "string" ? opts.reason : "";
    injectStyle();
    var native = isNativeApp();
    // 스토어가 준 상품·표시가를 tier 로 색인. 비어 있으면 결제 버튼을 안 띄운다.
    OFFERS = {};
    try { (window.GALLA_subOffers ? window.GALLA_subOffers() : []).forEach(function (o) { OFFERS[o.tier] = o; }); }
    catch (_) {}
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
      /* 💰 이번 주기 대화량 — 서버가 실제로 막는 식(_ai_budget)과 같은 숫자다. 원가가 아니라 % 만 온다. */
      var bud = ent.budget || null;
      var bpct = bud && bud.pct != null ? Math.max(0, Math.min(100, Number(bud.pct))) : null;
      var over = !!(bud && bud.over) || reason === "budget";
      var near = !over && bpct != null && bpct >= 80;
      var nxt = nextTier(ent.tier, plans);
      var rec = (over || near || reason === "nudge") && buyable(nxt) ? nxt : null;
      var when = bud && bud.resets_on ? mdText(bud.resets_on) : "";
      var banner = "";
      if (over || near) {
        var nl = rec ? (plans[rec].label || rec) : "";
        banner = '<div class="gpl-alert' + (over ? " over" : "") + '">' +
          "<b>" + esc(over ? "이번 주기 대화량을 다 썼어요" : "이번 주기 대화량을 " + bpct + "% 썼어요") + "</b>" +
          "<span>" + esc(nl
            ? "「" + nl + "」로 올리면 더 넉넉하게 이어갈 수 있어요." + (when ? " 기다리면 " + when + "에 새로 채워져요." : "")
            : (when ? when + "에 새로 채워져요." : "곧 새로 채워져요.")) + "</span></div>";
      }
      var known = ORDER.filter(function (k) { return plans[k]; });
      var extra = Object.keys(plans).filter(function (k) {
        return k !== "guest" && ORDER.indexOf(k) < 0;
      });
      var cards = known.concat(extra)
        .map(function (k) { return planCard(k, plans[k], ent.tier, native, k === rec); }).join("");

      body = banner +
        '<div class="gpl-now">' +
          '<div class="gpl-now-t">현재 <span class="gpl-badge">' + esc(ent.label || ent.tier) + "</span></div>" +
          (unlimited ? '<div class="gpl-cnt">대화 제한 없음</div>'
            : '<div class="gpl-cnt">남은 대화 ' + remain + "<span style=\"color:#7d8798;font-weight:600\"> / " + lim + "턴</span></div>" +
              '<div class="gpl-bar' + (low ? " low" : "") + '"><i style="width:' + pct + '%"></i></div>' +
              '<div class="gpl-sub">' + esc(ent.hours ? (ent.hours + "시간마다 새로 채워져요") : "") +
              (ent.resets_at && remain === 0 ? " · " + esc(resetText(ent.resets_at)) : "") + "</div>") +
          (bpct != null || over
            ? '<div class="gpl-bline"><span>이번 주기 대화량</span><b>' + (over ? 100 : bpct) + "%</b></div>" +
              '<div class="gpl-bar' + (over || near ? " low" : "") + '"><i style="width:' + (over ? 100 : bpct) + '%"></i></div>' +
              (when ? '<div class="gpl-sub">' + esc(when) + "에 새로 채워져요</div>" : "")
            : "") +
          (function () {
            var m = ent.month; if (!m) return "";
            /* 대화는 위의 '남은 대화 N/N턴'(5시간 창)이 이미 진실을 보여준다 — 월로 또 쓰면 중복이고,
               그 월 숫자는 아무도 안 막는다. 여기 남기는 건 조작뿐이다. */
            var rows = [
              { t: "앱 조작", u: m.tool_used, n: m.tool_included }
            ].filter(function (x) { return Number(x.n) > 0; });
            if (!rows.length) return "";
            return '<div class="gpl-mrow">' + rows.map(function (x) {
              var left = Math.max(Number(x.n) - Number(x.u || 0), 0);
              var w = Math.min(100, Math.round(Number(x.u || 0) / Math.max(Number(x.n), 1) * 100));
              return '<div class="gpl-m"><span>' + esc(x.t) + "</span>" +
                     '<b>' + left + '<i> / ' + x.n + "</i></b>" +
                     '<div class="gpl-bar"><i style="width:' + w + '%"></i></div></div>';
            }).join("") + "</div>" +
            (m.resets_on ? '<div class="gpl-sub">' + esc(String(m.resets_on).slice(5).replace("-", "월 ")) + "일에 새로 채워져요</div>" : "");
          })() +
          (ent.expires_at ? '<div class="gpl-sub">구독 만료 ' +
            esc(new Date(ent.expires_at).toLocaleDateString("ko-KR")) + "</div>" : "") +
        "</div>" + cards +
        (native
          ? (Object.keys(OFFERS).length
              ? '<div class="gpl-note">언제든 해지할 수 있어요. 남은 기간은 그대로 쓸 수 있어요.'
                + ' <button class="gpl-restore" type="button">구매 복원</button></div>'
              : '<div class="gpl-note">구독 변경은 준비 중이에요.</div>')
          : '<div class="gpl-note">언제든 해지할 수 있어요. 남은 기간은 그대로 쓸 수 있어요.</div>');
    }

    var scrim = document.createElement("div");
    scrim.className = "gpl-scrim";
    scrim.innerHTML = '<div class="gpl gpl-enter" role="dialog" aria-label="갈비스 구독">' +
      '<button class="gpl-x" aria-label="닫기">×</button>' +
      '<h3 class="gpl-h">갈비스 구독</h3>' + body + "</div>";
    document.body.appendChild(scrim);
    // rAF는 백그라운드 탭에서 멈춰 시트가 갇힌다 → setTimeout으로 등장 효과만 얹는다.
    setTimeout(function () {
      scrim.classList.add("on");
      var p = scrim.querySelector(".gpl"); if (p) p.classList.remove("gpl-enter");
    }, 20);

    function bye() { scrim.classList.remove("on"); setTimeout(function () { scrim.remove(); }, 220); }
    scrim.addEventListener("click", function (e) { if (e.target === scrim) bye(); });
    scrim.querySelector(".gpl-x").addEventListener("click", bye);
    // ⬆️ 추천 등급이 있으면 그 카드까지 내려서 보여준다(시트가 길어 첫 화면엔 안 보인다).
    var rc = scrim.querySelector(".gpl-card.rec");
    if (rc) setTimeout(function () { try { rc.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (_) {} }, 300);

    var lg = scrim.querySelector("[data-login]");
    if (lg) lg.addEventListener("click", function () {
      location.href = "login.html?next=" + encodeURIComponent(location.pathname + location.search);
    });
    /* 💳 인앱 구매 — 실제 지급은 서버 검증(verify-iap) 뒤에 일어난다.
       여기서 등급을 켜지 않는다. 클라가 켜는 등급은 공짜 구독과 같은 말이다. */
    scrim.querySelectorAll("[data-buy]").forEach(function (b) {
      b.addEventListener("click", async function () {
        b.disabled = true; var old = b.textContent; b.textContent = "스토어 여는 중…";
        var r = await (window.GALLA_buySub ? window.GALLA_buySub(b.dataset.buy) : { ok: false, reason: "no_module" });
        if (r && r.ok) { b.textContent = "확인 중…"; return; }          // approved 에서 이어진다
        b.disabled = false; b.textContent = old;
        if (r && r.reason !== "canceled" && window.GALLA_toast) window.GALLA_toast("결제를 시작하지 못했어요.");
      });
    });
    var rs = scrim.querySelector(".gpl-restore");
    if (rs) rs.addEventListener("click", async function () {
      rs.disabled = true; rs.textContent = "복원 중…";
      var r = await (window.GALLA_restorePurchases ? window.GALLA_restorePurchases() : { ok: false });
      rs.textContent = r && r.ok ? "복원 요청함" : "복원 실패";
    });
    scrim.querySelectorAll("[data-plan]").forEach(function (b) {
      b.addEventListener("click", function () {
        // 결제 연동 전 — 없는 기능을 있는 척하지 않는다. 준비되면 여기서 PG로 넘긴다.
        if (window.GALLA_startCheckout) { window.GALLA_startCheckout(b.dataset.plan); return; }
        b.disabled = true; b.textContent = "곧 열려요 — 조금만 기다려주세요";
      });
    });
  };

  /* 🔔 80% 안내 — 주기(등급)당 딱 한 번, 칩 하나만. 조르지 않는다.
     올릴 데가 없거나(맨 위) 지금 살 수 없으면 안 띄운다. 저장소를 못 쓰면 매 턴 뜰 수 있으니 아예 안 띄운다. */
  window.GALLA_budgetNudge = async function () {
    var ent = await fetchEnt();
    var bud = ent && ent.budget;
    if (!bud || bud.over || !(Number(bud.pct) >= 80)) return null;
    if (!buyable(nextTier(ent.tier, ent.plans))) return null;
    var key = "gpl-n80:" + ent.tier + ":" + (bud.resets_on || "");
    try {
      if (localStorage.getItem(key)) return null;
      localStorage.setItem(key, "1");
    } catch (_) { return null; }
    return { label: "대화량 " + Math.round(Number(bud.pct)) + "% 썼어요 · 등급 보기" };
  };

  /* 🔢 잔여 대화 pill — 갈비스 헤더 등에 붙여 쓴다. 탭하면 이용권 시트. */
  window.GALLA_planPill = async function (mount) {
    if (!mount) return null;
    var ent = await fetchEnt();
    if (!ent || ent.tier === "guest") return null;
    var lim = Number(ent.limit), used = Number(ent.used || 0);
    if (!(lim >= 0)) return null;                       // 제한 없음이면 굳이 표시하지 않는다
    var remain = Math.max(lim - used, 0);
    // 💰 주기 대화량이 바닥이면 5시간 창이 남아 있어도 막힌다 — 숫자 대신 '소진'을 보여준다(보이는 것 = 겪는 것).
    var bud = ent.budget || {};
    var bover = !!bud.over, bnear = !bover && Number(bud.pct) >= 80;
    injectStyle();
    var b = document.createElement("button");
    b.className = "gpl-pill" + (bover || bnear || remain <= Math.max(1, Math.round(lim * 0.2)) ? " low" : "");
    b.type = "button";
    b.textContent = bover ? "💬 소진" : "💬 " + remain;
    b.title = bover ? "이번 주기 대화량을 다 썼어요" : "남은 대화 " + remain + "턴";
    b.addEventListener("click", function (e) { e.stopPropagation(); window.GALLA_openPlans(bover ? { reason: "budget" } : null); });
    mount.appendChild(b);
    return b;
  };
})();
