/* 🌍 국제화 기반 — 문구를 '넣을 자리'를 만든다 (2026-08-09)
 *
 *  왜 이렇게 만들었나
 *   · 화면 문구가 208개 파일에 5.8만 단어 흩어져 있다. 키를 새로 발명해서 전부 갈아엎는 방식은
 *     현실적으로 끝나지 않는다 → **한국어 원문을 그대로 키로 쓴다**(gettext의 source-as-key).
 *     그래서 GALLA_t("로그인")은 번역이 없으면 "로그인"을 그대로 돌려준다.
 *     즉 **한 줄씩 점진적으로 감싸도 화면이 깨지지 않는다.** 큰 개편 없이 굴러간다.
 *   · 나라별로 다른 '값'(상담번호·통화·시간대)은 여기가 아니라 서버의 app_settings.locales에 있다.
 *     클라이언트가 따로 하드코딩하면 서버와 갈린다.
 *
 *  ⚠️ 지금은 사전이 비어 있다. 그게 정상이다 — 해외 오픈을 정하면 그때 채운다.
 *     이 파일의 목적은 '번역'이 아니라 '번역할 수 있는 상태'를 만드는 것이다.
 */
(function () {
  "use strict";
  var FALLBACK = "ko";

  /* 사전 — 한국어 원문 → 각 언어. 파일이 커지면 언어별로 쪼개고 여기선 로더만 남긴다. */
  var DICT = {
    en: {
      // 씨앗 몇 개만 — 구조가 도는지 확인용. 실제 채우기는 오픈 결정 후.
      "로그인": "Log in",
      "회원가입": "Sign up",
      "설정": "Settings",
      "홈": "Home",
      "검색": "Search",
      "알림": "Notifications"
    },
    "zh-TW": {
      "로그인": "登入",
      "회원가입": "註冊",
      "설정": "設定",
      "홈": "首頁",
      "검색": "搜尋",
      "알림": "通知"
    },
    ja: {
      "로그인": "ログイン",
      "회원가입": "新規登録",
      "설정": "設定",
      "홈": "ホーム",
      "검색": "検索",
      "알림": "お知らせ"
    }
  };

  /* 현재 언어 — 우선순위: 유저가 고른 값 > 브라우저 > 기본
     ⚠️ 서버의 users.locale이 최종 진실이다. 로그인 후 GALLA_setLocale로 맞춰준다. */
  function detect() {
    try {
      var saved = localStorage.getItem("galla_locale");
      if (saved) return saved;
    } catch (e) {}
    var nav = (navigator.language || "ko").toLowerCase();
    if (nav.indexOf("ko") === 0) return "ko";
    if (nav.indexOf("ja") === 0) return "ja";
    /* ⚠️ 중국어는 지역이 문자를 결정한다 — 대만·홍콩은 번체(Hant), 본토는 간체(Hans).
       'zh'로 뭉뚱그리면 대만 유저에게 간체가 나간다. */
    if (nav.indexOf("zh") === 0) {
      if (nav.indexOf("tw") >= 0 || nav.indexOf("hant") >= 0) return "zh-TW";
      if (nav.indexOf("hk") >= 0 || nav.indexOf("mo") >= 0) return "zh-HK";
      return "zh-CN";
    }
    if (nav.indexOf("en") === 0) return "en";
    return FALLBACK;
  }

  var current = detect();

  /* 번역 — 없으면 한국어 원문 그대로. 절대 빈 문자열을 돌려주지 않는다(화면이 사라지는 게 최악). */
  function t(ko, vars) {
    var out = ko;
    var d = DICT[current];
    if (d && Object.prototype.hasOwnProperty.call(d, ko)) out = d[ko];
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        out = out.split("{" + k + "}").join(String(vars[k]));
      });
    }
    return out;
  }

  /* 서버 설정(상담번호·통화·시간대) — 클라이언트가 따로 정의하지 않는다.
     실패해도 화면이 죽지 않게 항상 객체를 돌려준다. */
  var _cfg = null;
  function config() {
    if (_cfg) return Promise.resolve(_cfg);
    try {
      var SB = window.GALLA_SUPABASE_URL || (window.__GALLA__ && window.__GALLA__.url);
      var KEY = window.GALLA_ANON_KEY || (window.__GALLA__ && window.__GALLA__.anon);
      if (!SB || !KEY) return Promise.resolve({});
      return fetch(SB + "/rest/v1/rpc/locale_config", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: KEY, Authorization: "Bearer " + KEY },
        body: JSON.stringify({ p_locale: current })
      }).then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (j) { _cfg = j || {}; return _cfg; })
        .catch(function () { return {}; });
    } catch (e) { return Promise.resolve({}); }
  }

  function setLocale(loc) {
    if (!loc || loc === current) return;
    current = loc; _cfg = null;
    try { localStorage.setItem("galla_locale", loc); } catch (e) {}
    document.documentElement.setAttribute("lang", loc);
    try { window.dispatchEvent(new CustomEvent("galla:locale", { detail: loc })); } catch (e) {}
  }

  /* 숫자·통화·날짜 — 나라마다 표기가 다르다. 여기 한 곳에서만 만든다. */
  function money(amount) {
    var DEFAULT_CUR = { ko: "KRW", ja: "JPY", "zh-TW": "TWD", "zh-HK": "HKD", "zh-CN": "CNY", en: "USD" };
    var cur = (_cfg && _cfg.currency) || DEFAULT_CUR[current] || "USD";
    try {
      return new Intl.NumberFormat(current, { style: "currency", currency: cur,
        maximumFractionDigits: cur === "KRW" || cur === "JPY" ? 0 : 2 }).format(amount);
    } catch (e) { return String(amount); }
  }
  function when(iso, opts) {
    try {
      return new Intl.DateTimeFormat(current, Object.assign(
        { dateStyle: "medium", timeStyle: "short",
          timeZone: (_cfg && _cfg.tz) || "Asia/Seoul" }, opts || {})).format(new Date(iso));
    } catch (e) { return String(iso || ""); }
  }

  /* data-i18n 속성이 붙은 요소를 일괄 번역 — 새로 만드는 화면은 이걸 쓰면 코드가 안 지저분해진다.
     <span data-i18n>로그인</span>  ← 원문을 그대로 두고 감싸기만 한다 */
  function apply(root) {
    try {
      (root || document).querySelectorAll("[data-i18n]").forEach(function (el) {
        var src = el.getAttribute("data-i18n-src") || el.textContent.trim();
        if (!el.getAttribute("data-i18n-src")) el.setAttribute("data-i18n-src", src);
        el.textContent = t(src);
      });
    } catch (e) {}
  }

  window.GALLA_t = t;
  window.GALLA_locale = function () { return current; };
  window.GALLA_setLocale = setLocale;
  window.GALLA_localeConfig = config;
  window.GALLA_money = money;
  window.GALLA_when = when;
  window.GALLA_applyI18n = apply;

  try { document.documentElement.setAttribute("lang", current); } catch (e) {}
  if (current !== FALLBACK) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { apply(); });
    else apply();
  }
})();
