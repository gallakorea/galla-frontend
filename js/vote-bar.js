/* ============================================================
   GALLA 통합 진영 선택바 컴포넌트 — window.GALLA_VoteBar
   index / issue / shorts 3면 공용. 마크업·명수표시·동적 애니메이션 통일.
   ============================================================ */
(function () {
  const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));
  const pct = (pro, con) => { const t = (pro || 0) + (con || 0); return t ? Math.round((pro / t) * 100) : 50; };
  const reduce = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 내부 HTML(버튼 옵션). btn 속성은 페이지별 클릭 훅을 그대로 실어줌.
  function html(o) {
    o = o || {};
    const A = esc(o.factionA || "찬성이오"), B = esc(o.factionB || "난 반댈세");
    const pro = o.pro || 0, con = o.con || 0, total = pro + con;
    const pp = pct(pro, con), cp = 100 - pp;
    const buttons = o.buttons === false ? "" : `<div class="gv-btns">
      <button class="gv-btn gv-pro ${o.proClass || ""}" ${o.proAttr || ""}><span class="gv-emoji">👍</span><span class="gv-name">${A}</span></button>
      <button class="gv-btn gv-con ${o.conClass || ""}" ${o.conAttr || ""}><span class="gv-emoji">👎</span><span class="gv-name">${B}</span></button>
    </div>`;
    return `${buttons}
      <div class="gv-bar" data-pro="${pro}" data-con="${con}">
        <div class="gv-fill gv-fill-pro" style="width:${pp}%"><i class="gv-sheen"></i></div>
        <div class="gv-fill gv-fill-con" style="width:${cp}%"><i class="gv-sheen"></i></div>
        <div class="gv-pct gv-pct-pro${pp < 14 ? " gv-hide" : ""}">${pp}%</div>
        <div class="gv-pct gv-pct-con${cp < 14 ? " gv-hide" : ""}">${cp}%</div>
        <div class="gv-needle" style="left:${pp}%"></div>
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
    if (stance === "pro" || stance === "con") el.classList.add("gv-locked");
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

  // 통계 갱신 + 화려한 애니메이션. voted: 방금 투표한 진영('pro'|'con'), animate: 튐/팝 효과.
  function update(el, stats, opts) {
    if (!el) return; opts = opts || {}; stats = stats || {};
    const pro = stats.pro || 0, con = stats.con || 0, total = pro + con;
    const pp = pct(pro, con), cp = 100 - pp;
    const q = (s) => el.querySelector(s);
    const bar = q(".gv-bar"); if (bar) { bar.dataset.pro = pro; bar.dataset.con = con; }
    const fp = q(".gv-fill-pro"), fc = q(".gv-fill-con"), nd = q(".gv-needle");
    if (fp) fp.style.width = pp + "%"; if (fc) fc.style.width = cp + "%"; if (nd) nd.style.left = pp + "%";
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

  window.GALLA_VoteBar = { html, mount, update, setMine, applyVote, guardLocked, notice, pct };
})();
