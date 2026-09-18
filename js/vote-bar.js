/* ============================================================
   GALLA 통합 진영 선택바 컴포넌트 — window.GALLA_VoteBar
   index / issue / shorts 3면 공용. 마크업·명수표시·동적 애니메이션 통일.
   ============================================================ */
(function () {
  const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));
  const pct = (pro, con) => { const t = (pro || 0) + (con || 0); return t ? Math.round((pro / t) * 100) : 50; };
  const reduce = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ✨ 투표 전 반짝이 장식(26.9.18 사장님: 「투표 전이 심심 — 반짝이며 눌러 보게」). 투표하면 CSS 가 전부 끈다. */
  /* 🪢 줄다리기 사람(투표 뒤에만 보인다, 26.9.19 사장님: 「밧줄 당기며 땀 흘리는 표현」) — 왼쪽 팀 기준으로 그리고 오른쪽 팀은 좌우 반전.
     몸을 뒤로 젖혀 버티는 자세 · 땀방울 2개 · 발밑 먼지. 이모지 대신 SVG. */
  const FIG = '<svg class="gv-fig" viewBox="0 0 26 32" aria-hidden="true">' +
    '<g class="gv-fig-body" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="6.5" cy="7" r="3.6" fill="currentColor" stroke="none"/>' +
      '<path d="M8.6 10.4 L14.2 20"/>' +                 // 몸통(뒤로 젖힘)
      '<path d="M10.2 13.2 L25 16.4 M11.8 15.6 L25 16.4"/>' + // 두 팔 → 밧줄
      '<path d="M14.2 20 L10 29.5 M14.2 20 L19.6 29.5"/>' +  // 버틴 다리
    '</g>' +
    '<path class="gv-sweat s1" d="M3 3.2c-.9 1.3-1.2 2-.6 2.6.6.5 1.4.1 1.4-.7 0-.5-.3-1.1-.8-1.9z"/>' +
    '<path class="gv-sweat s2" d="M1.6 8.6c-.8 1.1-1 1.8-.5 2.3.5.4 1.2.1 1.2-.6 0-.4-.2-.9-.7-1.7z"/>' +
    '<ellipse class="gv-dust" cx="11" cy="30.6" rx="4" ry="1.3"/>' +
  '</svg>';
  /* 🙋 투표 전 — 똑바로 서서 한 팔로 「이리 와」 손짓하며 통통 뛴다(26.9.19 사장님). 투표하면 FIG(당기기)로 바뀐다. */
  const WAVE = '<svg class="gv-wave" viewBox="0 0 26 32" aria-hidden="true"><g class="gv-wave-body" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="6.5" r="3.6" fill="currentColor" stroke="none"/>' +
      '<path d="M12 10.4 L12 20.2"/>' +
      '<path d="M12 12.6 L8 18.4"/>' +
      '<path d="M12 20.2 L8.6 29.5 M12 20.2 L15.6 29.5"/>' +
      '<g class="gv-wave-arm"><path d="M12 12.6 L19.5 6.4"/><circle cx="20.6" cy="5.4" r="1.7" fill="currentColor" stroke="none"/></g>' +
    '</g></svg>';
  /* 말풍선은 팀 밖(.gv-tug 기준)에 둔다 — 좌우 반전된 반대팀 안에 두면 화면 오른쪽 끝에서 잘렸다(QA) */
  const TUG = '<div class="gv-tug" aria-hidden="true"><div class="gv-team gv-team-pro">' + FIG + FIG + WAVE + WAVE + '</div>' +
    '<div class="gv-rope"><i class="gv-rope-knot"></i></div><div class="gv-team gv-team-con">' + FIG + FIG + WAVE + WAVE + '</div>' +
    '<span class="gv-bub gv-bub-pro">이쪽이야!</span><span class="gv-bub gv-bub-con">우리 편 와!</span></div>';
  const FX = '<i class="gv-bglow"></i><i class="gv-bshine"></i><i class="gv-spark s1"></i><i class="gv-spark s2"></i><i class="gv-spark s3"></i>';
  // 내부 HTML(버튼 옵션). btn 속성은 페이지별 클릭 훅을 그대로 실어줌.
  function html(o) {
    o = o || {};
    const A = esc(o.factionA || "찬성이오"), B = esc(o.factionB || "난 반댈세");
    const pro = o.pro || 0, con = o.con || 0, total = pro + con;
    const pp = pct(pro, con), cp = 100 - pp;
    const buttons = o.buttons === false ? "" : `<div class="gv-btns">
      <button class="gv-btn gv-pro ${o.proClass || ""}" data-haptic="vote" ${o.proAttr || ""}>${FX}<span class="gv-emoji">👍</span><span class="gv-name">${A}</span></button>
      <button class="gv-btn gv-con ${o.conClass || ""}" data-haptic="vote" ${o.conAttr || ""}>${FX}<span class="gv-emoji">👎</span><span class="gv-name">${B}</span></button>
    </div>`;
    return `${buttons}${TUG}
      <div class="gv-bar" data-pro="${pro}" data-con="${con}" style="--gv-k:${pp}%">
        <div class="gv-fill gv-fill-pro" style="width:${pp}%"><i class="gv-sheen"></i></div>
        <div class="gv-fill gv-fill-con" style="width:${cp}%"><i class="gv-sheen"></i></div>
        <div class="gv-pct gv-pct-pro${pp < 14 ? " gv-hide" : ""}">${pp}%</div>
        <div class="gv-pct gv-pct-con${cp < 14 ? " gv-hide" : ""}">${cp}%</div>
        <div class="gv-needle" style="left:${pp}%"></div>
        <div class="gv-knot" style="left:${pp}%"></div>
        <i class="gv-glint g1"></i><i class="gv-glint g2"></i><i class="gv-glint g3"></i>
        <div class="gv-pop gv-pop-pro">+1</div><div class="gv-pop gv-pop-con">+1</div>
      </div>
      <div class="gv-stats">
        <span class="gv-side gv-side-pro"><b class="gv-c-pro">${total ? pro : "–"}</b>${total ? "명" : ""}</span>
        <span class="gv-total"><b class="gv-c-total">${total}</b>명 참전</span>
        <span class="gv-side gv-side-con">${total ? '' : ''}<b class="gv-c-con">${total ? con : "–"}</b>${total ? "명" : ""}</span>
      </div>`;
  }

  // 컨테이너에 마운트. 이후 update로 갱신.
  function mount(el, o) { if (!el) return; el.classList.add("gv"); el.innerHTML = html(Object.assign({}, o, { buttons: o && o.buttons })); applyLead(el, (o && o.pro) || 0, (o && o.con) || 0); if (o && o.myStance) setMine(el, o.myStance); }

  function applyLead(el, pro, con) {
    el.classList.remove("gv-lead-pro", "gv-lead-con");
    if (pro > con) el.classList.add("gv-lead-pro");
    else if (con > pro) el.classList.add("gv-lead-con");
  }
  function setMine(el, stance) {
    const a = el.querySelector(".gv-pro"), b = el.querySelector(".gv-con");
    a && a.classList.toggle("gv-mine", stance === "pro");
    b && b.classList.toggle("gv-mine", stance === "con");
    if (stance === "pro" || stance === "con") {
      el.classList.add("gv-locked");
      el.classList.toggle("gv-side-pro", stance === "pro");   // 투표 뒤 연출(빛 알갱이가 내 편 쪽으로)용
      el.classList.toggle("gv-side-con", stance === "con");
    }
  }

  function countUp(el, to, suffix) {
    if (!el) return; suffix = suffix || "";
    const from = parseFloat(el.dataset.v || el.textContent) || 0;
    if (reduce() || from === to) { el.textContent = to + suffix; el.dataset.v = to; return; }
    const t0 = performance.now(), dur = 650;
    el.classList.remove("gv-tick"); void el.offsetWidth; el.classList.add("gv-tick");
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * e) + suffix;
      if (p < 1) requestAnimationFrame(step); else { el.textContent = to + suffix; el.dataset.v = to; }
    };
    requestAnimationFrame(step);
  }

  /* 🪢 줄다리기 한 판 — 고른 쪽으로 확 끌려갔다(+10) 되받아치며(−6 +4 −2) 실제 비율에 멈춘다.
     WAAPI 라 도는 동안 CSS transition 을 덮고, 끝나면 이미 적어 둔 최종 폭에 그대로 선다(튐 없음). */
  function tug(el, from, to, side) {
    if (reduce() || !Element.prototype.animate) return;
    const fp = el.querySelector(".gv-fill-pro"), fc = el.querySelector(".gv-fill-con"), bar = el.querySelector(".gv-bar");
    const marks = [el.querySelector(".gv-needle"), el.querySelector(".gv-knot")].filter(Boolean);
    /* 끝(0·100%)으로 갈 때도 출렁임이 보이게 되받아치기를 크게(−12), 중간값만 3~97% 로 가둔다(QA: 0표→100% 에서 거의 안 움직였다) */
    const d = side === "pro" ? 1 : -1, clamp = (v) => Math.max(3, Math.min(97, v));
    const seq = [from, clamp(to + 8 * d), clamp(to - 12 * d), clamp(to + 5 * d), clamp(to - 4 * d), to];
    const off = [0, .28, .5, .68, .84, 1];
    const opt = { duration: 1500, easing: "cubic-bezier(.3,.7,.3,1)" };
    const kf = (fn) => seq.map((v, i) => Object.assign({ offset: off[i] }, fn(v)));
    try {
      fp && fp.animate(kf(v => ({ width: v + "%" })), opt);
      fc && fc.animate(kf(v => ({ width: (100 - v) + "%" })), opt);
      marks.forEach(m => m.animate(kf(v => ({ left: v + "%" })), opt));
    } catch (_) { return; }
    if (bar) { bar.classList.remove("gv-tugging"); void bar.offsetWidth; bar.classList.add("gv-tugging"); setTimeout(() => bar.classList.remove("gv-tugging"), 1100); }
  }

  // 통계 갱신 + 화려한 애니메이션. voted: 방금 투표한 진영('pro'|'con'), animate: 튐/팝 효과.
  function update(el, stats, opts) {
    if (!el) return; opts = opts || {}; stats = stats || {};
    const pro = stats.pro || 0, con = stats.con || 0, total = pro + con;
    const pp = pct(pro, con), cp = 100 - pp;
    const q = (s) => el.querySelector(s);
    const bar = q(".gv-bar"); if (bar) { bar.dataset.pro = pro; bar.dataset.con = con; }
    const fp = q(".gv-fill-pro"), fc = q(".gv-fill-con"), nd = q(".gv-needle"), kn = q(".gv-knot");
    const fromPP = fp ? (parseFloat(fp.style.width) || pp) : pp;
    if (fp) fp.style.width = pp + "%"; if (fc) fc.style.width = cp + "%"; if (nd) nd.style.left = pp + "%"; if (kn) kn.style.left = pp + "%";
    if (bar) bar.style.setProperty("--gv-k", pp + "%");   // 투표 뒤 빛 알갱이 출발점 = 매듭
    el.style.setProperty("--gv-k", pp + "%");              // 줄다리기 사람들 밧줄 매듭도 같은 자리
    if (opts.voted === "pro" || opts.voted === "con") tug(el, fromPP, pp, opts.voted);
    const pctP = q(".gv-pct-pro"), pctC = q(".gv-pct-con");
    if (pctP) { pctP.classList.toggle("gv-hide", pp < 14); countUp(pctP, pp, "%"); }
    if (pctC) { pctC.classList.toggle("gv-hide", cp < 14); countUp(pctC, cp, "%"); }
    const cP = q(".gv-c-pro"), cC = q(".gv-c-con"), cT = q(".gv-c-total");
    if (total) { countUp(cP, pro); countUp(cC, con); countUp(cT, total); }
    applyLead(el, pro, con);
    if (opts.myStance) setMine(el, opts.myStance);
    if (opts.animate !== false && (opts.voted || opts.bump)) {
      const bar = q(".gv-bar");
      if (bar) { bar.classList.remove("gv-bump"); void bar.offsetWidth; bar.classList.add("gv-bump"); }
    }
    if (opts.voted === "pro" || opts.voted === "con") {
      const pop = q(opts.voted === "pro" ? ".gv-pop-pro" : ".gv-pop-con");
      if (pop && !reduce()) { pop.classList.remove("go"); void pop.offsetWidth; pop.classList.add("go"); }
    }
  }

  // 낙관적 반영: 현재 표시 수치 + 내 진영(신규/전환)을 즉시 계산해 바를 움직임.
  // 이후 서버 재조회로 update() 하면 실제값으로 수렴(첫 클릭 지연 체감 제거).
  function applyVote(el, type) {
    if (!el || (type !== "pro" && type !== "con")) return;
    const bar = el.querySelector(".gv-bar");
    let pro = bar ? (parseInt(bar.dataset.pro, 10) || 0) : 0;
    let con = bar ? (parseInt(bar.dataset.con, 10) || 0) : 0;
    const a = el.querySelector(".gv-pro"), c = el.querySelector(".gv-con");
    const prev = a && a.classList.contains("gv-mine") ? "pro" : (c && c.classList.contains("gv-mine") ? "con" : null);
    // 진영 확정(변경 불가): 이미 투표했으면 어떤 버튼을 눌러도 변화·이펙트 없음
    if (prev) { setMine(el, prev); return; }
    if (type === "pro") pro++; else con++;
    if (prev === "pro" && pro > 0) pro--; else if (prev === "con" && con > 0) con--;
    update(el, { pro, con }, { voted: type, myStance: type, animate: true });
    // 🎉 화려한 축하 이펙트(아케이드풍 폭발 + 큰 글자)
    if (window.GALLA_VoteFX) {
      const btn = type === "pro" ? a : c;
      const name = btn && btn.querySelector(".gv-name") ? btn.querySelector(".gv-name").textContent : null;
      let origin = null;
      if (btn) { const r = btn.getBoundingClientRect(); origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
      window.GALLA_VoteFX.celebrate({ type, faction: name, origin });
    }
  }

  // 공용 안내 토스트
  let _noticeEl;
  function notice(msg) {
    if (!_noticeEl) { _noticeEl = document.createElement("div"); _noticeEl.className = "gv-notice"; document.body.appendChild(_noticeEl); }
    _noticeEl.textContent = msg;
    _noticeEl.classList.remove("show"); void _noticeEl.offsetWidth; _noticeEl.classList.add("show");
    clearTimeout(_noticeEl._t); _noticeEl._t = setTimeout(() => _noticeEl.classList.remove("show"), 1900);
  }

  // 클릭 시 서버 실제 투표 확인 → 이미 투표했으면 잠금+안내 후 true 반환(진행 중단).
  // 로드 직후 하이라이트 복원 전이라도 서버 기준으로 확정 잠금.
  async function guardLocked(el, issueId) {
    if (!window.GALLA_GET_MY_VOTE) return false;
    let my = null;
    try { my = await window.GALLA_GET_MY_VOTE(issueId); } catch (e) {}
    if (my === "pro" || my === "con") {
      setMine(el, my);
      notice("이미 진영을 선택했어요 · 변경할 수 없어요");
      return true;
    }
    return false;
  }

  /* 🎭 줄다리기 대사·치열해지는 순간(26.9.19 사장님: 「막 치열해지는 애니메이션, 살려주세요 같은 위트 있는 말풍선」)
     화면에 보이는 막대만 2.4초마다 훑는다. 투표 전: 부르는 대사가 바뀐다 / 투표 뒤: 양 팀이 번갈아 한마디 + 가끔 확 치열해진다. */
  /* 대사 창고 — 희로애락이 섞이게(26.9.19 사장님: 「열받아서·웃겨서·슬퍼서 참여하게, 다양하게, 욕도 좋다」).
     욕은 사장님 결정으로 실제 욕(시발·존나·개·썅)을 일부 섞는다 — ⚠️ 스토어 연령등급 설문의 「비속어」 항목을 이에 맞춰 신고해야 한다. */
  const LINES_CALL = {
    pro: ["이쪽이야!", "아 시발 도와줘!", "존나 밀리는 중 와줘ㅠ", "여기가 맞아!", "너 우리 편이지?", "손 잡아!", "빨리 와!!", "고민할 시간에 당겨!", "우리 편 오면 치킨 쏜다(거짓말)", "제발… 한 명만…",
          "여기 줄 서면 복 받음", "아 빨리 좀 와 시발", "안 오면 서운해할 거야", "니가 오면 이겨", "눈 마주쳤지? 이리 와", "편 안 고르면 반칙이다", "우리 편 사람 좋아"],
    con: ["우리 편 와!", "시발 빨리 와 팔 빠져", "존나 급해 도와줘!!", "이쪽이 진리!", "여기 자리 있어!", "망설이지 마!", "어서 와~", "저쪽 가면 후회한다", "여기가 찐이야", "혼자 구경만 할 거야?",
          "엄마가 이쪽 가랬어", "빨리 안 와? 시발 팔 떨어진다", "우리 편은 간식 있음", "와서 한 번만 잡아줘", "너 같은 사람 기다렸어", "구경꾼은 벌금", "딱 너만 오면 돼"],
  };
  const LINES_LOSE = ["아 시발 도와줘!!", "존나 밀린다 사람 좀!!", "썅 이게 말이 되냐", "개빡치네 진짜 시발", "존나 억울하다 진짜", "아 썅 줄 놓칠 뻔", "아 시발 밀린다", "이게 지네?? 개빡치네", "우리 편 다 어디 갔냐", "눈물 난다 진짜…", "한 명만… 제발 한 명만…", "배신자들 다 나와",
    "아 시발 손바닥 다 까졌어", "이럴 거면 왜 불렀어ㅠ", "엄마 나 끌려가…", "저놈들 뭐 먹고 왔냐", "억울해서 잠 못 잔다", "아직 안 끝났다 이것들아",
    "살려주세요ㅠㅠ", "내 인생도 이렇게 밀려…", "지원군 언제 와!!", "진짜 개빡친다", "놓으면 끝이야 버텨!!", "나 여기서 죽는다…", "누가 기름 발랐냐 줄에",
    "아 쟤네 반칙하는 거 봤어?", "울면서 당기는 중"];
  const LINES_WIN = ["존나 쉽네ㅋㅋ", "개꿀잼 이거 뭐냐ㅋㅋ", "시발 이게 이기네ㅋㅋ", "존나 행복하다", "개꿀ㅋㅋㅋ", "밥은 먹고 왔냐?ㅋ", "이 맛에 줄다리기 하지", "벌써 끝났냐?ㅋㅋ", "힘 좀 써봐 그쪽~", "우리 편 개잘함", "저쪽 표정 봐ㅋㅋ",
    "한 발만 더!!", "이기는 편 우리 편~", "여유롭다 여유로워", "손 풀리는 중ㅋ", "끝까지 방심 금물!", "승리의 땀방울…", "저쪽 우는 소리 들림", "오늘 치킨은 우리 거",
    "줄 좀 더 줄까?ㅋ", "이 정도면 산책이지", "고맙다 저쪽 편 ㅋ", "완전 압살ㅋㅋ", "오 이제 좀 재밌네"];
  const LINES_TIE = ["아 시발 팔 나간다", "존나 힘들어 진짜", "개힘들다 살려줘", "썅 누가 좀 대신 당겨", "살려주세요ㅠㅠ", "죽을 것 같아…", "팔 빠질 것 같아", "손 놓으면 진다!", "허리 나갔어…", "물 한 잔만…", "누가 내 발 밟았어?!",
    "한 명만 더 오면 이겨!", "영차! 영차!", "끝까지 간다!!", "숨 좀 쉬자…", "엄마 나 여기 있어!", "밀리면 끝이야!", "이거 놓으면 나 진짜 운다",
    "누가 먼저 놓나 보자", "아 시발 존나 팽팽하네", "팔에 쥐 났어ㅠ", "내일 출근 못 함", "방귀 뀌면 진다 참아", "심장 터진다 진짜", "이거 몇 시간째냐",
    "간식 사 올 사람?", "다리 후들후들", "끝나면 삼겹살이다!!"];
  /* 그 팀이 밀리는지·이기는지로 대사를 고른다(막대의 찬반 수 기준) */
  function lineFor(el, side) {
    const bar = el.querySelector(".gv-bar");
    const pro = bar ? (parseInt(bar.dataset.pro, 10) || 0) : 0, con = bar ? (parseInt(bar.dataset.con, 10) || 0) : 0;
    const share = (pro + con) ? (side === "pro" ? pro : con) / (pro + con) * 100 : 50;
    const pool = share < 42 ? LINES_LOSE : share > 58 ? LINES_WIN : LINES_TIE;
    return pick(Math.random() < .2 ? LINES_TIE : pool);   // 가끔은 섞어서 예측 못 하게
  }
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  let tugTimer = null;
  function tugTick() {
    if (document.hidden || reduce()) return;
    const vh = window.innerHeight || 800;
    document.querySelectorAll(".gv").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > vh) return;              // 화면 밖은 건너뛴다
      const locked = el.classList.contains("gv-locked");
      if (!locked) {                                                   // 투표 전 — 말풍선이 안 보일 때 대사만 바꿔 둔다
        const bp = el.querySelector(".gv-bub-pro"), bc = el.querySelector(".gv-bub-con");
        if (bp && Math.random() < .5) bp.textContent = pick(LINES_CALL.pro);
        if (bc && Math.random() < .5) bc.textContent = pick(LINES_CALL.con);
        return;
      }
      if (el._talking) return;
      if (Math.random() < .55) {                                       // 한마디
        const side = Math.random() < .5 ? "pro" : "con";
        const b = el.querySelector(".gv-bub-" + side); if (!b) return;
        b.textContent = lineFor(el, side);
        el._talking = true; el.classList.add("gv-talk-" + side);
        setTimeout(() => { el.classList.remove("gv-talk-" + side); el._talking = false; }, 2200);
      }
      if (Math.random() < .35 && !el.classList.contains("gv-surge")) { // 확 치열해지는 순간
        el.classList.add("gv-surge");
        setTimeout(() => el.classList.remove("gv-surge"), 1800);
      }
    });
  }
  function startTug() { if (!tugTimer) tugTimer = setInterval(tugTick, 2400); }
  startTug();

  window.GALLA_VoteBar = { html, mount, update, setMine, applyVote, guardLocked, notice, pct };
})();
