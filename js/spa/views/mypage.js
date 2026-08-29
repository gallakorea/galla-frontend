/* ═══════════════════════════════════════════════════════════════
 * SPA 뷰 어댑터 — 마이페이지 탭
 *
 * 역할: mypage.html의 페이지 로직(js/mypage.js 이중 모드)을 단일문서에서
 * 구동한다. 필수 스크립트를 1회만 주입(loadScriptsOnce)한 뒤
 * window.GALLA_PAGE_MYPAGE.mount(root, params)에 위임.
 *
 * 전제(app.html이 이미 로드): vendor/supabase.js, js/supabase.js
 *   (waitForSupabaseClient·GALLA_setAvatar·GALLA_avatarSrc·GALLA_thumb·GALLA_toast),
 *   dm-sound.js, dm-call.js. CSS(mypage/items 등)는 view-loader가 주입.
 * ═══════════════════════════════════════════════════════════════ */

const V = () => (window.GALLA_V ? "?v=" + window.GALLA_V : "");

/* mypage.html 로드 순서 그대로 — 뒤 스크립트가 앞 전역을 쓴다 */
const SCRIPTS = [
  "/js/items.js",          // openShop + 상점 시트 + 인벤토리(🛒 상점 버튼)
  "/js/donate.js",         // GALLA_renderEarnings(발의자 후원 수익 카드)
  "/js/charge.js",         // GALLA_needGP/GALLA_needGC(재화 부족 안내·갈라페이 충전)
  "/js/gallian.js",        // GALLA_gallianOf(등급 칩·레벨 텍스트)
  "/js/profile-stats.js",  // 전적·팔로워/팔로잉 시트·일기토 전적 칩(로드 즉시 boot)
  "/js/auth-gate.js",      // 비로그인 진입 차단 게이트(MPA 에만 있었다)
  "/js/fx.js",             // GALLA_FX(파티클) — 다른 뷰를 먼저 안 열면 없다
  "/js/noti-icons.js",     // 알림 아이콘 세트
  "/js/dm.js",            // DM 배지·GALLA_openDM — MPA 는 이 페이지에서도 싣는다(웹/앱 동작 일치)
  "/js/mypage.js",         // 본체(이중 모드) — GALLA_PAGE_MYPAGE 정의
];

const loaded = new Map();   // path → Promise
function loadScriptOnce(src) {
  const key = src.split("?")[0];
  if (loaded.has(key)) return loaded.get(key);
  // 이미 문서에 있으면(셸이 로드했거나 다른 뷰가 주입) 스킵
  const has = Array.from(document.scripts).some(s => {
    try { return new URL(s.src, location.href).pathname === key; } catch (_) { return false; }
  });
  const p = has ? Promise.resolve() : new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src + V();
    s.onload = () => res();
    s.onerror = () => rej(new Error("script load fail " + src));
    document.head.appendChild(s);
  });
  loaded.set(key, p);
  return p;
}

/* 네비 아바타 — MPA에선 nav.js가 셸로 postMessage했지만, 단일문서 SPA에선
   같은 window의 GALLA_setNavAvatar(라우터 정의)를 직접 호출한다. */
async function syncNavAvatar() {
  try {
    const sb = window.supabaseClient ||
      (window.waitForSupabaseClient ? await window.waitForSupabaseClient() : null);
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    const uid = data?.session?.user?.id;
    if (!uid) return;
    const { data: u } = await sb.from("users").select("avatar_url").eq("id", uid).maybeSingle();
    const photo = (u?.avatar_url && window.GALLA_avatarSrc) ? window.GALLA_avatarSrc(u.avatar_url) : null;
    try {   // nav.js와 같은 캐시 키 — 다음 부팅 때 라우터가 즉시 적용
      if (photo) localStorage.setItem("galla_nav_avatar", photo);
      else localStorage.removeItem("galla_nav_avatar");
    } catch (_) {}
    if (window.GALLA_setNavAvatar) window.GALLA_setNavAvatar(photo);
  } catch (_) { /* 실패 시 캐시/기본 아이콘 유지 */ }
}

export async function mount(root, params) {
  for (const src of SCRIPTS) await loadScriptOnce(src);   // 순서 보존(직렬)
  await window.GALLA_PAGE_MYPAGE.mount(root, params);
  syncNavAvatar();   // 프로필 로드와 병행 — 대기 불필요
}

export function unmount()    { window.GALLA_PAGE_MYPAGE?.unmount?.(); }
export function activate()   { window.GALLA_PAGE_MYPAGE?.activate?.(); }
export function deactivate() { window.GALLA_PAGE_MYPAGE?.deactivate?.(); }
export function scrolltop()  { window.GALLA_PAGE_MYPAGE?.scrolltop?.(); }
