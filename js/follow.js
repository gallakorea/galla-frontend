/* =========================================================
   👥 공용 팔로우 — .js-follow[data-uid] 자동 바인딩
   follows 테이블(follower/following) 단일 소스 → 전 페이지 연동
   (index/issue는 기존 로직 유지; 이 모듈은 예측·광장 등에서 사용)
   ========================================================= */
(function () {
  // 페이지마다 클라이언트 전역명이 다름(supabaseClient 또는 client인 window.supabase)
  const sb = () => window.supabaseClient || (window.supabase && window.supabase.from ? window.supabase : null);
  let myId = null, loaded = false;
  const follows = new Set();

  // 로그인 모달이 없는 페이지(광장 등) 대비 폴백 정의
  if (!window.GALLA_needLogin) {
    window.GALLA_needLogin = function (msg) {
      let m = document.getElementById("galla-login-modal");
      if (!m) {
        m = document.createElement("div"); m.id = "galla-login-modal"; m.className = "glm-dim";
        m.innerHTML = '<div class="glm-card"><div class="glm-ico">🔒</div><div class="glm-title">로그인이 필요해요</div><div class="glm-msg"></div><div class="glm-btns"><button class="glm-cancel" type="button">닫기</button><button class="glm-go" type="button">로그인하기</button></div></div>';
        document.body.appendChild(m);
        m.addEventListener("click", (e) => { if (e.target === m || e.target.classList.contains("glm-cancel")) m.classList.remove("open"); });
        m.querySelector(".glm-go").addEventListener("click", () => { (window.GALLA_nav||function(u){location.href=u})("login.html"); });
      }
      m.querySelector(".glm-msg").textContent = msg || "이 기능은 로그인 후 이용할 수 있어요.";
      requestAnimationFrame(() => m.classList.add("open"));
    };
  }

  async function load() {
    if (loaded) return;
    const c = sb(); if (!c) return;   // 클라이언트 준비 전이면 다음 스캔에서 재시도
    try {
      const { data: { user } } = await c.auth.getUser();
      myId = user?.id || null;
      if (myId) {
        const { data } = await c.from("follows").select("following").eq("follower", myId);
        (data || []).forEach(r => follows.add(r.following));
      }
      loaded = true;
    } catch (e) {}
  }

  function paint(btn) {
    const uid = btn.dataset.uid;
    if (myId && uid === myId) { btn.style.display = "none"; return; }  // 내 콘텐츠엔 숨김
    const on = follows.has(uid);
    btn.classList.toggle("following", on);
    btn.textContent = on ? "팔로잉" : "+ 팔로우";
  }

  async function toggle(btn) {
    const uid = btn.dataset.uid; if (!uid) return;
    if (!myId) { window.GALLA_needLogin ? window.GALLA_needLogin("팔로우하려면 로그인이 필요해요.") : ((window.GALLA_nav||function(u){location.href=u})("login.html")); return; }
    const on = follows.has(uid);
    if (on) follows.delete(uid); else follows.add(uid);
    // 같은 uid의 모든 버튼 동기화
    document.querySelectorAll(`.js-follow[data-uid="${uid}"]`).forEach(paint);
    window.BattleFX?.haptic?.("tap");
    const r = on
      ? await sb().from("follows").delete().eq("follower", myId).eq("following", uid)
      : await sb().from("follows").insert({ follower: myId, following: uid });
    if (r.error) { if (on) follows.add(uid); else follows.delete(uid); document.querySelectorAll(`.js-follow[data-uid="${uid}"]`).forEach(paint); }
    else if (!on) { try { window.GALLA_pushSend && window.GALLA_pushSend("follow", uid); } catch (_) {} }   // 📮 팔로우 즉시 푸시(앱 밖에서도 도착)
  }

  window.GALLA_bindFollow = async function (root) {
    // 새(미바인딩) 버튼만 처리 — paint()가 DOM을 바꿔 옵저버가 다시 도는 무한루프 방지
    const btns = [...(root || document).querySelectorAll(".js-follow[data-uid]")].filter(b => !b.__fbound);
    if (!btns.length) return;
    btns.forEach(b => { b.__fbound = 1; b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); toggle(b); }); });
    await load();
    btns.forEach(paint);
  };

  let __t = null;
  function boot() {
    window.GALLA_bindFollow();
    try {
      new MutationObserver(() => { clearTimeout(__t); __t = setTimeout(() => window.GALLA_bindFollow(), 120); })
        .observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
