/* =========================================================
   유저 액션 팝오버 — 닉네임/프로필 클릭 시 '그 옆'에 뜨는 미니 메뉴
   규칙: [data-user-id]가 붙은 요소를 누르면 그 요소 옆에 열림
         → 프로필 / 일기토 / 메시지
   본인이면 메시지·일기토 숨김. window.GALLA_openUserSheet(id, nick, anchorEl)
   ========================================================= */
(function () {
  let pop = null, ME = null, meResolved = false, curAnchor = null;

  const avatarColor = id => {
    let h = 0; for (const c of (id || "")) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${h} 55% 45%)`;
  };

  async function resolveMe() {
    if (meResolved) return ME;
    try {
      const sb = window.supabaseClient;
      if (sb) { const { data } = await sb.auth.getSession(); ME = data?.session?.user?.id || null; }
    } catch (_) {}
    meResolved = true;
    return ME;
  }

  function build() {
    if (pop) return pop;
    pop = document.createElement("div");
    pop.id = "user-pop";
    pop.className = "us-pop";
    pop.innerHTML = `
      <span class="us-pop-arrow"></span>
      <div class="us-pop-head">
        <span class="us-pop-ava" id="upAva"></span>
        <span class="us-pop-name" id="upName"></span>
      </div>
      <div class="us-pop-actions">
        <button class="us-pop-btn" data-act="profile">👤<i>프로필</i></button>
        <button class="us-pop-btn us-follow js-follow" id="upFollow" type="button">＋ 팔로우</button>
        <button class="us-pop-btn primary" data-act="dm" id="upDm">✉️<i>메시지</i></button>
      </div>`;
    document.body.appendChild(pop);
    pop.addEventListener("click", e => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      e.stopPropagation();
      const uid = pop.dataset.uid, nick = pop.dataset.nick || "";
      close();
      if (act === "profile") {
        // SPA: 문서 이탈 금지 — 프로필은 스택 push(본인 포함 — MPA도 항상 ?user=였음)
        // (mypage.html?user=로 이탈하면 nav.js 앱/PWA 셸 복귀가 ?user를 버려 '내 프로필'이 뜨던 버그)
        if (window.GALLA_gotoProfile) window.GALLA_gotoProfile(uid);
        else location.href = `mypage.html?user=${uid}`;
      } else if (act === "dm") {
        if (window.startDM) window.startDM(uid, nick);
        else if (window.GALLA_gotoProfile) window.GALLA_gotoProfile(uid); // dm 미로드 페이지 폴백
        else location.href = `mypage.html?user=${uid}`;
      }
    });
    return pop;
  }

  function close() { pop?.classList.remove("open"); curAnchor = null; }

  window.GALLA_openUserSheet = async function (uid, nick, anchor) {
    if (!uid) return;
    build();
    const me = await resolveMe();
    pop.dataset.uid = uid;
    pop.dataset.nick = nick || "";
    const name = nick || "사용자";
    const selfPre = (me && me === uid);
    pop.querySelector("#upName").textContent = selfPre ? `${name} (나)` : name;
    const ava = pop.querySelector("#upAva");
    ava.textContent = (name.charAt(0) || "?").toUpperCase();
    ava.style.background = avatarColor(uid);
    const self = (me && me === uid);
    // 본인이면 팔로우·메시지·일기토는 숨고 '내 프로필'만 남는다 — 버튼 문구도 맞춰준다
    const profI = pop.querySelector('[data-act="profile"] i');
    if (profI) profI.textContent = self ? "내 프로필" : "프로필";
    pop.classList.toggle("self", self);
    pop.querySelector("#upDm").style.display = self ? "none" : "";
    // 댓글 게시판(예측·뉴스·유튜브·광장·이슈)은 격론 자동 감지가 담당(사용자 확정).
    // 팔로우/언팔로우 — follow.js(.js-follow) 재사용. 열 때마다 새 버튼으로 갈아끼워
    // uid 바인딩·상태 페인트를 다시 받는다(팔로잉이면 '팔로잉'으로 표시)
    const fOld = pop.querySelector("#upFollow");
    if (fOld) {
      const f = fOld.cloneNode(false);
      f.textContent = "＋ 팔로우";
      f.dataset.uid = uid;
      fOld.replaceWith(f);
      f.style.display = (self || !window.GALLA_bindFollow) ? "none" : "";
      if (!self && window.GALLA_bindFollow) window.GALLA_bindFollow(pop);
    }

    // 앵커(누른 닉네임) 옆에 배치 — 기본은 바로 아래, 화면 밑이면 위로
    pop.style.visibility = "hidden";
    pop.classList.add("open");
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const r = anchor?.getBoundingClientRect?.() ||
      { left: innerWidth / 2 - pw / 2, right: innerWidth / 2, top: innerHeight / 2, bottom: innerHeight / 2, width: 0 };
    let x = Math.min(Math.max(r.left, 8), innerWidth - pw - 8);
    let y = r.bottom + 8;
    let above = false;
    if (y + ph > innerHeight - 12) { y = r.top - ph - 8; above = true; }
    // 화살표를 앵커 중앙에 겨냥
    const ax = Math.min(Math.max((r.left + (r.width || 0) / 2) - x, 16), pw - 16);
    pop.style.setProperty("--us-ax", ax + "px");
    pop.classList.toggle("above", above);
    pop.style.left = x + "px";
    pop.style.top = Math.max(y, 8) + "px";
    pop.style.visibility = "";
    curAnchor = anchor || null;
  };

  // 바깥 탭/스크롤/ESC → 닫기
  document.addEventListener("click", e => {
    if (!pop?.classList.contains("open")) return;
    if (e.target.closest("#user-pop") || e.target.closest("[data-user-id]")) return;
    close();
  }, true);
  window.addEventListener("scroll", close, { passive: true, capture: true });
  window.addEventListener("keydown", e => { if (e.key === "Escape") close(); });

  // 전역 위임: [data-user-id]를 누르면 그 옆에 팝오버 (빈 id·익명 제외)
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-user-id]");
    if (!el) return;
    const uid = el.getAttribute("data-user-id");
    if (!uid) return;
    e.preventDefault();
    e.stopPropagation();
    // 같은 앵커 다시 누르면 토글로 닫기
    if (pop?.classList.contains("open") && curAnchor === el) { close(); return; }
    window.GALLA_openUserSheet(uid, el.getAttribute("data-user-nick") || el.textContent.trim(), el);
  }, true); // capture: 다른 카드 클릭 핸들러보다 먼저
})();
