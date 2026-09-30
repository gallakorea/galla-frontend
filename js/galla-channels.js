/* 🏛 광장 채널 단일 소스 (2026-09-30)
   ─────────────────────────────────────────────────────────────
   채널명·이모지·색·설명·슬러그를 여기 한 곳에서만 정의한다.
   그동안 같은 목록이 5곳(작성 select·필터 칩·plaza-channels EMO/GRAD·홈 드로어·
   owner-actions 수정폼)에 하드카피돼 개수·라벨이 어긋났다(커리어·이직 vs 직장·경력 등).
   → 앞으로 채널을 추가/개명하려면 이 파일만 고친다. DB channels 시드도 이 목록과 일치시킨다.

   설계(레딧식): '기본 채널'은 최소(핵심 7개)만. 나머지는 유저가 개설하는 채널이 주력.
   과거 10종 중 세계·여행/패션·뷰티/19금은 기존 글 보존 위해 DB 에 남기되 is_default=false
   (레거시·유저 취급) — 이 단일 소스의 '기본 목록'에는 넣지 않는다.

   전역: window.GALLA_CHANNELS
     .defaults            기본 채널 배열 [{name,slug,emoji,color,desc}]
     .names()             기본 채널명 배열
     .meta(name)          해당 채널 메타(없으면 null)
     .emoji(name)         이모지(폴백 💬)
     .color(name)         그라디언트(폴백 인디고)
     .isDefault(name)     기본 채널인가
   ───────────────────────────────────────────────────────────── */
(function () {
  var DEFAULTS = [
    { name: "자유·수다",   slug: "free",     emoji: "💬", color: "linear-gradient(135deg,#6f86ff,#4361ff)", desc: "주제 없이 자유롭게 수다" },
    { name: "정치·사회",   slug: "politics", emoji: "🗳️", color: "linear-gradient(135deg,#8a5aff,#5a6bff)", desc: "시사·정치 토론" },
    { name: "경제·투자",   slug: "economy",  emoji: "📈", color: "linear-gradient(135deg,#2fd07a,#1f9d5e)", desc: "경제·재테크·투자" },
    { name: "직장·경력",   slug: "career",   emoji: "🏢", color: "linear-gradient(135deg,#5ab0ff,#4361ff)", desc: "직장 생활·커리어" },
    { name: "연애·결혼",   slug: "love",     emoji: "💘", color: "linear-gradient(135deg,#ff5a9a,#ff5a6e)", desc: "연애·결혼·육아" },
    { name: "엔터·스포츠", slug: "ent",      emoji: "🎬", color: "linear-gradient(135deg,#ffcf5a,#ff9a5a)", desc: "엔터·방송·스포츠" },
    { name: "음식·맛집",   slug: "food",     emoji: "🍜", color: "linear-gradient(135deg,#ff9a5a,#ff5a6e)", desc: "맛집·요리·먹거리" }
  ];
  var BY = {};
  DEFAULTS.forEach(function (c) { BY[c.name] = c; });

  var FALLBACK_COLOR = "linear-gradient(135deg,#3a4fff,#6f86ff)";

  window.GALLA_CHANNELS = {
    defaults: DEFAULTS,
    names: function () { return DEFAULTS.map(function (c) { return c.name; }); },
    meta: function (name) { return BY[name] || null; },
    emoji: function (name) { return (BY[name] && BY[name].emoji) || "💬"; },
    color: function (name) { return (BY[name] && BY[name].color) || FALLBACK_COLOR; },
    isDefault: function (name) { return !!BY[name]; }
  };
})();
