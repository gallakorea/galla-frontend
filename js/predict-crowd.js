/* ============================================================
   🏳️ 예측 깃발 진영 — window.GALLA_PredictCrowd
   (26.9.20 사장님: 「예측 피드·상세에도 이슈의 사람 SVG 가 호객하고 싸우는 애니메이션, 말풍선도」)

   이슈는 둘이 맞붙는 줄다리기지만, 예측은 선택지가 여럿이라 「어느 깃발 아래로 모이나」가 그림이다.
   · 선택지 = 깃발 하나. 깃발 아래 사람 수 = 그 선택지 비율.
   · 사람들은 통통 뛰며 손짓해 부른다(호객). 가끔 한 명이 옆 깃발로 갈아타면 양쪽이 한마디씩 한다.
   · 내가 참여한 선택지는 깃발이 금빛(.pc-mine).
   대사는 js/predict-lines.js(GALLA_PREDICT_LINES). 없으면 최소 목록으로 돈다.
   ============================================================ */
(function () {
  if (window.GALLA_PredictCrowd) return;      // 중복 로드 가드(MPA·SPA 양쪽에서 실린다)
  const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));
  const reduce = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FALL = { CALL: ["이쪽으로 와!"], TOP: ["거봐 내가 맞댔지"], LOW: ["아무도 없네…"], MID: ["조용히 지켜본다"],
    DEFECT_LEAVE: ["나 저쪽 갈게"], DEFECT_STAY: ["배신자!!"], DEFECT_WELCOME: ["잘 왔어!"], DUO: [["곧 텅 빈다", "우린 꽉 찼는데?"]] };
  const L = () => window.GALLA_PREDICT_LINES || FALL;

  /* 🔀 셔플 백 — 한 바퀴 다 돌기 전엔 같은 대사가 다시 안 나온다(줄다리기와 같은 규칙) */
  const bags = {};
  function draw(key, arr) {
    if (!arr || !arr.length) return "";
    let b = bags[key];
    if (!b || !b.length || b._src !== arr) {
      b = arr.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
      b._src = arr; bags[key] = b;
    }
    return b.pop();
  }

  /* 🙋 호객하는 사람 — 똑바로 서서 한 팔로 「이리 와」 손짓하며 통통 뛴다(이슈 줄다리기의 WAVE 와 같은 몸) */
  const FOLK = '<svg class="pc-folk" viewBox="0 0 26 32" aria-hidden="true">' +
    '<g class="pc-folk-body" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="6.5" r="3.6" fill="currentColor" stroke="none"/>' +
      '<path d="M12 10.4 L12 20.2"/>' +
      '<path d="M12 12.6 L8 18.4"/>' +
      '<path d="M12 20.2 L8.6 29.5 M12 20.2 L15.6 29.5"/>' +
      '<g class="pc-folk-arm"><path d="M12 12.6 L19.5 6.4"/><circle cx="20.6" cy="5.4" r="1.7" fill="currentColor" stroke="none"/></g>' +
    '</g></svg>';
  /* 🏳️ 깃발 — 장대에 천이 나부낀다(천은 CSS 로 흔든다) */
  const FLAG = '<svg class="pc-flag" viewBox="0 0 22 30" aria-hidden="true">' +
    '<path class="pc-pole" d="M4 29 L4 2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
    '<path class="pc-cloth" d="M4 3.4 C9 1.4 13 5.4 19 3.4 L19 12 C13 14 9 10 4 12 Z" fill="currentColor"/>' +
  '</svg>';

  /* 선택지 색 — 상세(predict-market)의 색과 같은 규칙(순번 기반)으로 돌린다 */
  const HUES = [212, 344, 152, 38, 276, 190, 18, 96];
  const hueOf = (i) => HUES[i % HUES.length];

  /* 사람 수 = 비율(0~100) → 1~6명. 0% 라도 깃발지기 한 명은 남는다(텅 빈 깃발 대사가 살아야 한다).
     선택지가 넷이면 다들 20~30% 언저리라, 비율을 그대로 곱하면 어디나 한 명씩 서서 「모임」이 안 보였다(26.9.20 QA) → 1 + 비율×5. */
  const folkCount = (p) => Math.max(1, Math.min(6, 1 + Math.round((p || 0) / 100 * 5)));

  /* o: { outcomes:[{id,label,p}], mine:<선택한 outcome id|null>, max:노출 깃발 수(기본 4), compact:true 면 라벨 짧게 } */
  function html(o) {
    o = o || {};
    const all = (o.outcomes || []).filter(Boolean);
    if (!all.length) return "";
    const max = o.max || 4;
    const sorted = all.slice().sort((a, b) => (b.p || 0) - (a.p || 0));
    const show = sorted.slice(0, max), rest = sorted.length - show.length;
    const top = show[0], low = show[show.length - 1];
    const camps = show.map((oc, i) => {
      const p = Math.round(oc.p || 0);
      const n = folkCount(p);
      const mine = o.mine != null && String(o.mine) === String(oc.id);
      const rank = oc === top ? "top" : (oc === low && show.length > 1 ? "low" : "mid");
      /* flex 비중을 비율에 맞춰 — 붐비는 깃발이 자리를 더 차지한다(몰림이 눈에 보이게, 최소 폭은 보장) */
      return `<div class="pc-camp pc-${rank}${mine ? " pc-mine" : ""}" data-oc="${esc(oc.id)}" data-p="${p}" data-rank="${rank}"
        style="--pc-h:${hueOf(all.indexOf(oc))};flex:${Math.max(1, p) + 14} 1 0">
        <span class="pc-bub" aria-hidden="true"></span>
        <div class="pc-stage">${FLAG}<span class="pc-folks">${FOLK.repeat(n)}</span></div>
        <div class="pc-meta">${o.labels === false ? "" : `<span class="pc-lab">${esc(oc.label || "")}</span>`}<b class="pc-pct">${p}%</b></div>
      </div>`;
    }).join("");
    return `<div class="pc"${o.mid ? ` data-mid="${esc(o.mid)}"` : ""}>
      <div class="pc-ground">${camps}</div>
      ${rest > 0 ? `<div class="pc-rest">+${rest}개 깃발 더</div>` : ""}
    </div>`;
  }

  /* 컨테이너에 붙이기 — 이후 update 로 숫자만 갈아끼운다 */
  function mount(el, o) { if (!el) return; el.innerHTML = html(o); }

  /* 비율이 바뀌면 사람 수·폭·퍼센트를 따라가게 한다(상세는 30초마다 새로 읽는다) */
  function update(root, outcomes, mine) {
    if (!root) return;
    (outcomes || []).forEach((oc) => {
      const camp = root.querySelector(`.pc-camp[data-oc="${CSS.escape(String(oc.id))}"]`);
      if (!camp) return;
      const p = Math.round(oc.p || 0);
      camp.dataset.p = p;
      camp.style.flex = `${Math.max(1, p) + 14} 1 0`;
      const pct = camp.querySelector(".pc-pct"); if (pct) pct.textContent = p + "%";
      const folks = camp.querySelector(".pc-folks");
      if (folks) {
        const want = folkCount(p), have = folks.querySelectorAll(".pc-folk").length;
        if (want > have) folks.insertAdjacentHTML("beforeend", FOLK.repeat(want - have));
        else for (let i = 0; i < have - want; i++) folks.lastElementChild && folks.lastElementChild.remove();
      }
      camp.classList.toggle("pc-mine", mine != null && String(mine) === String(oc.id));
    });
  }

  /* ── 말풍선·갈아타기 틱 ─────────────────────────────────────
     화면에 보이는 깃발판만 2.4초마다 훑는다(줄다리기와 같은 주기). */
  function say(camp, text, ms) {
    const b = camp.querySelector(".pc-bub"); if (!b || !text) return;
    b.textContent = text;
    camp.classList.remove("pc-talk"); void camp.offsetWidth; camp.classList.add("pc-talk");
    clearTimeout(camp._t); camp._t = setTimeout(() => camp.classList.remove("pc-talk"), ms || 2200);
  }
  function lineFor(camp) {
    const rank = camp.dataset.rank;
    if (Math.random() < .35) return draw("CALL", L().CALL);
    return draw(rank.toUpperCase(), L()[rank.toUpperCase()] || L().MID);
  }
  /* 🏃 갈아타기 — 한 명이 옆 깃발로 뛰어간다. 떠난 쪽은 야유, 받은 쪽은 환영.
     ⚠️ 깃발 아래 사람 수는 그 선택지의 비율이다 — 실제로 옮기면 같은 25% 인데 한쪽 1명·한쪽 3명이 되어
     숫자가 거짓말을 한다(26.9.20 사장님 지적). 그래서 뛰어가는 건 복제한 그림자 한 명이고,
     양쪽 정원은 그대로 둔다. 인원이 진짜 바뀌는 건 비율이 바뀔 때(update)뿐이다. */
  function defect(board) {
    const camps = [...board.querySelectorAll(".pc-camp")];
    if (camps.length < 2) return;
    // 붐비는 곳에서 한산한 곳으로 가는 그림이 재밌다(가끔 반대로도 간다)
    const sorted = camps.slice().sort((a, b) => (+b.dataset.p) - (+a.dataset.p));
    const from = Math.random() < .75 ? sorted[0] : sorted[Math.floor(Math.random() * sorted.length)];
    const pool = camps.filter(c => c !== from);
    const to = pool[Math.floor(Math.random() * pool.length)];
    const folk = from.querySelector(".pc-folk:last-child");
    const dest = to.querySelector(".pc-folks");
    if (!folk || !dest) return;
    const a = folk.getBoundingClientRect(), b = dest.getBoundingClientRect();
    const ghost = folk.cloneNode(true);
    ghost.classList.add("pc-run");
    ghost.style.left = a.left - board.getBoundingClientRect().left + "px";
    ghost.style.top = a.top - board.getBoundingClientRect().top + "px";
    ghost.style.setProperty("--pc-dx", ((b.left + b.width) - a.left).toFixed(0) + "px");
    board.appendChild(ghost);
    folk.classList.add("pc-gone");                       // 원래 자리는 잠깐 흐려졌다 돌아온다
    say(from, draw("DEFECT_LEAVE", L().DEFECT_LEAVE), 1600);
    setTimeout(() => say(from, draw("DEFECT_STAY", L().DEFECT_STAY), 1800), 700);
    setTimeout(() => {
      ghost.remove();
      folk.classList.remove("pc-gone");
      say(to, draw("DEFECT_WELCOME", L().DEFECT_WELCOME), 1800);
    }, 1150);
  }
  function tick() {
    if (document.hidden || reduce()) return;
    const vh = window.innerHeight || 800;
    document.querySelectorAll(".pc").forEach((board) => {
      const r = board.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > vh) return;      // 화면 밖은 건너뛴다
      if (board._busy) return;
      const camps = [...board.querySelectorAll(".pc-camp")];
      if (!camps.length) return;
      const roll = Math.random();
      if (roll < .22 && camps.length > 1) {                     // 갈아타기
        board._busy = true;
        defect(board);
        setTimeout(() => { board._busy = false; }, 3200);
      } else if (roll < .5 && camps.length > 1) {               // 주고받기(두 깃발이 한마디씩)
        const pair = draw("DUO", L().DUO); if (!pair || pair.length < 2) return;
        const i = Math.floor(Math.random() * camps.length);
        let j = Math.floor(Math.random() * camps.length); if (j === i) j = (i + 1) % camps.length;
        board._busy = true;
        say(camps[i], pair[0], 2000);
        setTimeout(() => say(camps[j], pair[1], 2000), 1100);
        setTimeout(() => { board._busy = false; }, 3300);
      } else {                                                   // 한마디
        const c = camps[Math.floor(Math.random() * camps.length)];
        say(c, lineFor(c));
      }
    });
  }
  let timer = null;
  function start() { if (!timer) timer = setInterval(tick, 2400); }
  start();

  window.GALLA_PredictCrowd = { html, mount, update, tick, folkCount };
})();
