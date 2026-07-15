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
    "쫄깃한","어리둥절","초긴장한","방구석","야근중인","카페인중독","다이어트중인","월요병걸린","로또당첨된","길잃은",
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
  /* 👻 유령 토글 (댓글 컴포저 공용) */
  .ghost-toggle{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:999px;cursor:pointer;
    font-size:12.5px;font-weight:800;background:#1a1726;border:1px solid #33304a;color:#9a92b5;transition:all .15s ease}
  .ghost-toggle.sm{padding:6px 10px;font-size:12px}
  .ghost-toggle .gt-hint{font-size:10.5px;color:#6b6486;font-weight:700}
  .ghost-toggle.has-pass{color:#c9beea}
  .ghost-toggle.has-pass .gt-hint{display:none}
  .ghost-toggle.on{background:linear-gradient(100deg,#4a3f7e,#372f5e);border-color:#7a6bc0;color:#fff;box-shadow:0 0 16px rgba(122,107,192,.25)}
  .ghost-toggle:active{transform:scale(.95)}
  .ghost-av-wrap .ghost-av{width:100%;height:100%;font-size:1em}`;
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

  // 위임: 유령 닉/아바타 탭 → 연출(이동 차단)
  document.addEventListener("click", (e) => {
    const g = e.target.closest(".ghost-nick, .ghost-av");
    if (!g) return;
    e.preventDefault(); e.stopPropagation();
    const t = (e.touches && e.touches[0]) || e;
    ghostBlock(t.clientX || innerWidth / 2, t.clientY || 120);
  }, true);
})();
