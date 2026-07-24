/* =========================================================
   ghost.js — 유령(익명) 공용 정체 생성기 + 프로필 탭 차단 연출
   window.GALLA_ghost(seed) → { name, color, avatarHTML }
     · 이름 = 병맛 형용사 + 명사 (시드 결정적 → 유저당 고정 페르소나)
     · 아바타 = 시드 색 그라디언트 + 유령류 이모지 (이미지 불필요)
   유령 이름/아바타(.ghost-nick / .ghost-av) 탭 → "따라갈 수 없어요" 애니메이션.
========================================================= */
(function () {
  if (window.GALLA_ghost) return;

  const ADJ = ["불타는","소리지르는","폭주하는","춤추는","수줍은","억울한","현타온","과몰입한","헐크된","삐진",
    "잠못드는","풀충전된","해탈한","배고픈","졸린","화난","신난","우울한","심심한","진지한",
    "광기의","느긋한","까칠한","몽롱한","상큼한","무기력한","열받은","반짝이는","축축한","바삭한",
    "쫄깃한","어리둥절","초긴장한","방구석","야근중인","카페인중독","다이어트중인","월요병걸린","운수대통한","길잃은",
    "배터리1퍼","은둔형","관종끼있는","프로불편러","무념무상","만렙찍은","각성한","폭발직전","나른한","심야의",
    "새벽감성","딴짓하는","눈치보는","급발진한","냉정한","얼어붙은","반박불가","팩폭하는","츤데레","극한의",
    "초월한","방황하는","은근슬쩍","대환장","폼미친","자체발광","현실도피","텅장된","불금맞은","숙취있는"];

  const NOUN = ["빨래맨","마징가","감자경찰","우주오리","양말도둑","라면요정","직장인좀비","키보드워리어","번개토스터","심야치킨",
    "고독한미식가","전설의붕어빵","로봇청소기","카페인귀신","문어박사","돌멩이","고양이집사","판다","너구리","알파카",
    "수달","왕만두","꽈배기","슈크림","물음표살인마","이불킥러","노잼봇","딸기우유","아메리카노","곰돌이",
    "나무늘보","햄스터","오리너구리","참새","두더지","개구리왕자","폰중독자","침대요정","야식파티원","만두귀신",
    "감자칩","소보로빵","초코송이","젤리곰","우주비행사","슈퍼히어로","악당보스","미스터리맨","방구석평론가","오뎅",
    "떡볶이","순대","김밥","컵라면","코딩노예","마감요정","퇴근전사","출근좀비","불멍전문가","라면킬러",
    "츄러스","하품대장","낮잠요정","방콕전문가","셀카장인","인간고슴도치","월급루팡","갈비천사","사이버전사","붕어싸만코"];

  const EMO = ["👻","🎭","🕶️","🦝","🐙","🛸","🍄","🤖","🐸","🐧","🦊","🐨","🦉","🐳","🦑","🐝","🦖","🍙","🌮","🎃","🪐","👽","🐢","🦔"];

  // 문자열 → 32bit 해시 (결정적). salt로 서로 다른 축 추출.
  function hash(str, salt) {
    let h = 2166136261 ^ salt;
    const s = String(str || "x");
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0);
  }

  window.GALLA_ghost = function (seed) {
    if (!seed) return { name: "익명의 유령", color: "#8a7bb0",
      avatarHTML: `<span class="ghost-av" style="background:linear-gradient(135deg,#5b4b86,#3a3050)">👻</span>` };
    const adj = ADJ[hash(seed, 7) % ADJ.length];
    const noun = NOUN[hash(seed, 131) % NOUN.length];
    const emo = EMO[hash(seed, 977) % EMO.length];
    const hue = hash(seed, 313) % 360, hue2 = (hue + 42) % 360;
    const color = `hsl(${hue} 55% 62%)`;
    return {
      name: `${adj} ${noun}`,
      color,
      avatarHTML: `<span class="ghost-av" style="background:linear-gradient(135deg,hsl(${hue} 58% 46%),hsl(${hue2} 55% 34%))">${emo}</span>`,
    };
  };

  /* ---- 댓글 작성자 공용 배지: 아바타 + 닉네임 + 레벨, 탭 = 유저시트([data-user-id]) ---- */
  const guEsc = s => (s == null ? "" : String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));
  // avatar_url은 'userid/avatar.jpg' 상대경로 — js/supabase.js 미로드 페이지용 폴백 해석기
  window.GALLA_avatarSrc = window.GALLA_avatarSrc || function (avatarUrl) {
    if (!avatarUrl) return window.GALLA_DEFAULT_AVATAR || "/assets/app-icons/default-avatar.png";
    if (/^https?:\/\//.test(avatarUrl)) return avatarUrl;
    return `https://bidqauputnhkqepvdzrr.supabase.co/storage/v1/render/image/public/profiles/${avatarUrl}?width=128&height=128&resize=cover`; // 원본 1MB 방지
  };
  window.__GU_CACHE = window.__GU_CACHE || {};
  window.GALLA_userMap = async function (ids) {
    const need = [...new Set((ids || []).filter(Boolean))].filter(id => !window.__GU_CACHE[id]);
    if (need.length && window.supabaseClient) {
      try {
        const { data } = await window.supabaseClient.from("users").select("id,nickname,level,avatar_url").in("id", need);
        (data || []).forEach(u => (window.__GU_CACHE[u.id] = u));
      } catch (_) {}
    }
    return window.__GU_CACHE;
  };
  // 레벨 → 등급 아이콘 (인덱스/마이페이지와 동일 구간)
  window.GALLA_tierIcon = window.GALLA_tierIcon || function (lv) {
    lv = Number(lv) || 1;
    return lv >= 20 ? "👑" : lv >= 10 ? "⚔️" : lv >= 5 ? "🔰" : "🌱";
  };
  window.GALLA_userBadge = function (uid, fallbackNick, o = {}) {
    const u = Object.assign({}, window.__GU_CACHE[uid] || {}, o);
    const nick = u.nickname || fallbackNick || "익명";
    const av = u.avatar_url
      ? `<img class="gu-av" src="${guEsc(window.GALLA_avatarSrc(u.avatar_url))}" alt="" onerror="this.style.display='none'">`
      : `<span class="gu-av gu-av0">${guEsc((nick || "갈").trim().charAt(0) || "갈")}</span>`;
    // 등급 아이콘·스타일은 전역 도색기가 갈라리안 등급(GI)으로 자동 부여한다
    // — 여기서 level 기반 인라인 아이콘을 넣으면 중복·불일치가 된다.
    const attrs = uid ? ` data-user-id="${guEsc(uid)}" data-user-nick="${guEsc(nick)}"` : "";
    const nickAttr = uid ? ` data-nick-uid="${guEsc(uid)}"` : "";
    return `<span class="gu-wrap"${attrs}>${av}<span class="gu-nick"${nickAttr}>${guEsc(nick)}</span></span>`;
  };

  /* ---- 스타일 주입 ---- */
  const css = `
  .ghost-av{display:inline-flex;align-items:center;justify-content:center;width:1.9em;height:1.9em;
    border-radius:50%;font-size:.95em;line-height:1;vertical-align:middle;flex:0 0 auto;
    box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
  .ghost-nick{cursor:pointer}
  .ghost-nick::after{content:"👻";font-size:.82em;margin-left:3px;opacity:.75}
  .gh-float{position:fixed;z-index:100001;pointer-events:none;font-size:30px;will-change:transform,opacity;
    transition:transform 1.15s cubic-bezier(.2,.7,.3,1),opacity 1.15s ease}
  .gh-bubble{position:fixed;z-index:100001;pointer-events:none;transform:translate(-50%,0) scale(.6);opacity:0;
    background:linear-gradient(135deg,#2b2740,#191728);color:#e9e4ff;border:1px solid #4a3f6e;
    padding:8px 13px;border-radius:14px;font-size:12.5px;font-weight:800;white-space:nowrap;
    box-shadow:0 8px 24px rgba(0,0,0,.45);transition:transform .3s cubic-bezier(.2,.9,.3,1.3),opacity .3s ease}
  .gh-bubble.on{transform:translate(-50%,0) scale(1);opacity:1}
  @media (prefers-reduced-motion: reduce){.gh-float,.gh-bubble{transition:none}}
  /* 👻 유령 토글 — 전 게시판 동일한 콤팩트 알약(페이지별 CSS를 이기도록 !important 정규화).
     내용은 GALLA_ghostBind의 paintGhostBtn이 통째로 다시 그린다(마크업 제각각 방지). */
  .ghost-toggle{
    all:revert;
    display:inline-flex !important;align-items:center !important;justify-content:center !important;
    gap:5px !important;flex:0 0 auto !important;width:auto !important;min-width:0 !important;max-width:none !important;
    height:34px !important;min-height:34px !important;max-height:34px !important;
    padding:0 11px !important;margin:0 !important;box-sizing:border-box !important;
    border-radius:999px !important;cursor:pointer;
    font-size:12px !important;font-weight:800 !important;line-height:1 !important;
    white-space:nowrap !important;writing-mode:horizontal-tb !important;letter-spacing:0 !important;
    background:#1a1726 !important;border:1px solid #33304a !important;color:#9a92b5 !important;
    transition:background .15s ease,color .15s ease,box-shadow .15s ease,transform .1s ease}
  .ghost-toggle .gt-ic{font-size:15px !important;line-height:1 !important}
  .ghost-toggle .gt-state{font-size:11px !important;font-weight:900 !important;line-height:1 !important;
    background:none !important;padding:0 !important;color:inherit !important;letter-spacing:.02em !important;white-space:nowrap !important}
  .ghost-toggle.has-pass{color:#c9beea !important}
  /* .sm = 인라인 컴포저용 아이콘-온리(입력창 폭 확보). 상태는 우상단 미니 배지로 */
  .ghost-toggle.sm{width:34px !important;min-width:34px !important;padding:0 !important;position:relative !important;overflow:visible !important}
  .ghost-toggle.sm .gt-state{display:none !important}
  .ghost-toggle.sm::after{content:attr(data-short);position:absolute;top:-7px;right:-9px;
    font-size:9px;font-weight:900;line-height:1;padding:3px 5px;border-radius:99px;white-space:nowrap;
    background:#26203c;color:#b9aee0;border:1px solid #4a4070}
  .ghost-toggle.sm.on::after{background:#8c78e6;color:#fff;border-color:#c9beea}
  .ghost-toggle.sm[data-short=""]::after{display:none}
  /* 유령 버튼 옆 게시 버튼이 세로로 깨지지 않게 */
  .pmd-cmt-send,.gnc-send,.hv-cmt-send{white-space:nowrap !important;flex:0 0 auto !important}
  .ghost-toggle.on{background:linear-gradient(100deg,#5a4b9e,#42387a) !important;border-color:#9d8cf0 !important;color:#fff !important;
    box-shadow:0 0 18px rgba(140,120,230,.45);animation:ghGlow 1.8s ease-in-out infinite}
  @keyframes ghGlow{0%,100%{box-shadow:0 0 12px rgba(140,120,230,.35)}50%{box-shadow:0 0 24px rgba(140,120,230,.65)}}
  .ghost-toggle:active{transform:scale(.95)}
  .ghost-av-wrap .ghost-av{width:100%;height:100%;font-size:1em}
  /* 댓글 작성자 배지 (아바타+닉+레벨) */
  .gu-wrap{display:inline-flex;align-items:center;gap:6px;cursor:pointer;min-width:0;vertical-align:middle}
  .gu-av{width:22px;height:22px;border-radius:50%;object-fit:cover;flex:0 0 auto;background:#23222e;display:inline-block}
  .gu-av0{display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;
    color:#cfcfe0;background:linear-gradient(135deg,#2c2b3a,#1b1a26);line-height:1}
  .gu-nick{font-weight:800;color:#e9e9f0;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:38vw}
  .gu-tier{font-size:12px;line-height:1;flex:0 0 auto}
  .gu-lv{font-size:9.5px;font-weight:900;color:#8fa3ff;background:rgba(90,110,255,.14);
    border:1px solid rgba(120,140,255,.35);padding:1px 6px;border-radius:99px;flex:0 0 auto;line-height:1.3}
  /* 유령 토스트 */
  .gh-toast{position:fixed;left:50%;bottom:110px;transform:translateX(-50%) translateY(14px) scale(.92);z-index:100002;
    max-width:88vw;text-align:center;background:linear-gradient(135deg,#2b2444,#1a1630);color:#efeaff;
    border:1px solid #6a5aa8;border-radius:16px;padding:12px 18px;font-size:13.5px;line-height:1.5;
    box-shadow:0 12px 36px rgba(0,0,0,.55),0 0 24px rgba(122,107,192,.25);
    opacity:0;pointer-events:none;transition:opacity .25s ease,transform .3s cubic-bezier(.2,.9,.3,1.25)}
  .gh-toast.on{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}
  .gh-toast small{color:#a89ccb}
  @media (prefers-reduced-motion: reduce){.ghost-toggle.on{animation:none}.gh-toast{transition:none}}`;
  const st = document.createElement("style"); st.id = "galla-ghost-style"; st.textContent = css;
  document.head.appendChild(st);

  const LINES = ["👻 유령은 따라갈 수 없어요!", "🚫 실체가 없어서 못 붙잡아요", "스르륵… 사라졌다!",
    "여긴 유령입니다 👻", "붙잡으려 했지만 손이 통과됐어요", "정체는 영원히 비밀 🤫"];

  function ghostBlock(x, y) {
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 말풍선
    const bub = document.createElement("div");
    bub.className = "gh-bubble";
    bub.textContent = LINES[Math.floor(Math.random() * LINES.length)];
    bub.style.left = Math.min(Math.max(x, 80), innerWidth - 80) + "px";
    bub.style.top = (y - 54) + "px";
    document.body.appendChild(bub);
    requestAnimationFrame(() => bub.classList.add("on"));
    setTimeout(() => { bub.classList.remove("on"); setTimeout(() => bub.remove(), 320); }, 1400);
    if (reduce) return;
    // 유령이 떠올라 사라짐
    const g = document.createElement("div");
    g.className = "gh-float"; g.textContent = "👻";
    g.style.left = (x - 15) + "px"; g.style.top = (y - 12) + "px";
    document.body.appendChild(g);
    requestAnimationFrame(() => { g.style.transform = `translate(${(Math.random() * 40 - 20)}px,-90px) rotate(${Math.random() * 30 - 15}deg)`; g.style.opacity = "0"; });
    setTimeout(() => g.remove(), 1200);
    if (window.GALLA_FX) window.GALLA_FX.burst(x, y, { emojis: ["👻", "✨", "💨"], count: 8, spread: 50 });
  }
  window.GALLA_ghostBlock = ghostBlock;

  /* ---- 공용 컴포저 토글 헬퍼 ----
     사용: 버튼 마크업(.ghost-toggle#아무id) 넣고 GALLA_ghostBind(btn) 호출.
     게시 시 is_anonymous = btn.classList.contains('on'). */
  window.GALLA_ghostReady = async function (force) {
    if (window.__GHOST_ST && !force) return window.__GHOST_ST;
    try {
      // 클라이언트·세션 복원을 기다린 뒤 조회 — 안 기다리면 로그인 상태인데도
      // anon으로 판정되어 "유령권 필요"가 캐시로 굳는 버그가 있었다
      for (let i = 0; i < 66 && !window.supabaseClient; i++) await new Promise(r => setTimeout(r, 150));
      const c = window.supabaseClient;
      if (!c) { window.__GHOST_ST = { active: false }; return window.__GHOST_ST; }
      const { data: s } = await c.auth.getSession();
      if (!s?.session) { window.__GHOST_ST = { active: false }; return window.__GHOST_ST; }
      const { data } = await c.rpc("ghost_status");
      window.__GHOST_ST = data?.ok ? data : { active: false };
    } catch { window.__GHOST_ST = { active: false }; }
    return window.__GHOST_ST;
  };
  /* 세션이 늦게 붙거나 로그인/로그아웃 시 — 상태 재조회 + 바인딩된 버튼 전부 다시 그림 */
  const boundBtns = new Set();
  (function hookAuth() {
    const c = window.supabaseClient;
    if (!c?.auth?.onAuthStateChange) { setTimeout(hookAuth, 400); return; }
    c.auth.onAuthStateChange(() => {
      window.GALLA_ghostReady(true).then(() => {
        boundBtns.forEach(b => { if (document.contains(b)) paintGhostBtn(b); });
      });
    });
  })();
  const ghostDaysLeft = () => {
    const st = window.__GHOST_ST;
    if (!st?.active || !st.until) return 0;
    return Math.max(1, Math.ceil((new Date(st.until) - Date.now()) / 86400000));
  };
  /* 유령 전용 토스트 — 어느 페이지든 동일하게 크게 보인다 */
  function ghToast(html, ms = 2600) {
    document.getElementById("gh-toast")?.remove();
    const t = document.createElement("div");
    t.id = "gh-toast"; t.className = "gh-toast";
    t.innerHTML = html;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("on"));
    setTimeout(() => { t.classList.remove("on"); setTimeout(() => t.remove(), 300); }, ms);
  }
  window.GALLA_ghostToast = ghToast;

  /* 토글 버튼 — 내용을 통째로 표준 형태(👻 + 짧은 상태)로 다시 그린다.
     페이지마다 제각각이던 마크업·정렬 문제를 여기서 통일. 긴 설명은 토스트가 담당. */
  function paintGhostBtn(btn) {
    const st = window.__GHOST_ST || {};
    const on = btn.classList.contains("on");
    btn.classList.toggle("has-pass", !!st.active);
    const d = ghostDaysLeft();
    const lab = on ? `ON · ${d}일` : st.active ? `OFF · ${d}일` : "유령권 필요";
    btn.innerHTML = `<span class="gt-ic">👻</span><span class="gt-state">${lab}</span>`;
    // .sm(아이콘-온리) 미니 배지용 짧은 상태
    btn.dataset.short = on ? "ON" : st.active ? `${d}일` : "";
    btn.title = on ? `유령 모드 ON · ${d}일 남음` : st.active ? `유령 모드 OFF · ${d}일 보유` : "유령권 필요 — 탭해서 구매";
  }

  window.GALLA_ghostBind = function (btn, opts = {}) {
    if (!btn || btn._ghostBound) return; btn._ghostBound = true;
    boundBtns.add(btn);
    window.GALLA_ghostReady().then(() => paintGhostBtn(btn));
    btn.addEventListener("click", () => {
      const st = window.__GHOST_ST;
      if (!st?.active) {
        ghToast(`👻 <b>유령권이 필요해요</b><br><small>상점에서 3일권(800GP)부터 구매할 수 있어요</small>`);
        setTimeout(() => {
          if (confirm("👻 유령으로 활동하려면 유령권이 필요해요.\n상점에서 유령권을 구매할까요? (3일 800GP~)")) {
            if (window.openShop) window.openShop(); else location.href = "settings.html";
          }
        }, 350);
        return;
      }
      const on = btn.classList.toggle("on");
      paintGhostBtn(btn);
      if (on) {
        const g = window.GALLA_ghost(st.seed);
        ghToast(`👻 <b>유령 모드 ON</b> — 지금부터 <b style="color:${g.color}">${g.name}</b>(으)로 활동!<br>
          <small>${ghostDaysLeft()}일 남음 · 이 기간에 쓴 댓글은 영원히 익명이에요</small>`);
        const r = btn.getBoundingClientRect();
        if (window.GALLA_FX) window.GALLA_FX.burst(r.left + r.width / 2, r.top, { emojis: ["👻", "💨", "✨"], count: 12, spread: 60, up: 40 });
      } else {
        ghToast(`🙋 <b>유령 모드 OFF</b> — 다시 내 이름으로 활동합니다`);
      }
      opts.onChange && opts.onChange(on);
    });
  };
  // 게시 실패 공통 처리: no_ghost_pass면 구매 유도 후 true 반환
  window.GALLA_ghostInsertError = function (error, btn) {
    if (String(error?.message || "").includes("no_ghost_pass")) {
      btn?.classList.remove("on");
      window.__GHOST_ST = { active: false };
      if (confirm("👻 유령권이 만료됐어요. 상점에서 다시 구매할까요?")) {
        if (window.openShop) window.openShop(); else location.href = "settings.html";
      }
      return true;
    }
    return false;
  };

  // 위임: 유령 닉/아바타 탭 → 연출(이동 차단)
  document.addEventListener("click", (e) => {
    const g = e.target.closest(".ghost-nick, .ghost-av");
    if (!g) return;
    e.preventDefault(); e.stopPropagation();
    const t = (e.touches && e.touches[0]) || e;
    ghostBlock(t.clientX || innerWidth / 2, t.clientY || 120);
  }, true);
})();
