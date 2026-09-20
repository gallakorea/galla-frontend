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

  /* 🙋 사람 3종 — 어느 깃발에 서 있느냐로 몸짓이 다르다(26.9.20 사장님: 「많은 데는 우글우글 파티, 없는 데는 울고 있는」)
     · FOLK  : 호객(한 팔로 「이리 와」) — 보통 깃발
     · PARTY : 두 팔 만세로 방방 뛴다 — 가장 붐비는 깃발
     · CRY   : 고개 숙이고 어깨를 들썩이며 운다(눈물 두 방울) — 텅 빈 깃발 */
  const BODY = (inner) => '<g class="pc-folk-body" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + inner + '</g>';
  const FOLK = '<svg class="pc-folk" viewBox="0 0 26 32" aria-hidden="true">' + BODY(
      '<circle cx="12" cy="6.5" r="3.6" fill="currentColor" stroke="none"/>' +
      '<path d="M12 10.4 L12 20.2"/>' +
      '<path d="M12 12.6 L8 18.4"/>' +
      '<path d="M12 20.2 L8.6 29.5 M12 20.2 L15.6 29.5"/>' +
      '<g class="pc-folk-arm"><path d="M12 12.6 L19.5 6.4"/><circle cx="20.6" cy="5.4" r="1.7" fill="currentColor" stroke="none"/></g>'
    ) + '</svg>';
  const PARTY = '<svg class="pc-folk pc-party" viewBox="0 0 26 32" aria-hidden="true">' + BODY(
      '<circle cx="12" cy="6.5" r="3.6" fill="currentColor" stroke="none"/>' +
      '<path d="M12 10.4 L12 20.2"/>' +
      '<path d="M12 20.2 L8 29.5 M12 20.2 L16.4 29.5"/>' +
      '<g class="pc-arm-l"><path d="M12 12.8 L5.4 6.2"/></g>' +
      '<g class="pc-arm-r"><path d="M12 12.8 L18.6 6.2"/></g>'
    ) + '</svg>';
  /* 💪 중간 깃발 — 주먹 불끈 쥐고 「아직 안 끝났다」(26.9.20 사장님: 「중간 애들은 열심히 화이팅 넘치는 모습」).
     한 팔을 위아래로 펌프질하고 이마에 땀 한 방울. */
  const FIGHT = '<svg class="pc-folk pc-fight" viewBox="0 0 26 32" aria-hidden="true">' + BODY(
      '<circle cx="12" cy="6.5" r="3.6" fill="currentColor" stroke="none"/>' +
      '<path d="M12 10.4 L12 20.2"/>' +
      '<path d="M12 20.2 L7.6 29.5 M12 20.2 L16.8 29.5"/>' +
      '<path d="M12 13.2 L7.2 17.2"/>' +
      '<g class="pc-pump"><path d="M12 12.8 L17.4 8.6"/><circle cx="18.6" cy="7.6" r="2.1" fill="currentColor" stroke="none"/></g>'
    ) +
    '<path class="pc-sweat" d="M5.6 4.6c-.8 1.2-1.1 1.9-.5 2.4.6.5 1.3.1 1.3-.7 0-.4-.3-1-.8-1.7z" fill="currentColor"/>' +
  '</svg>';
  const CRY = '<svg class="pc-folk pc-cry" viewBox="0 0 26 32" aria-hidden="true">' + BODY(
      '<circle cx="11" cy="8" r="3.6" fill="currentColor" stroke="none"/>' +
      '<path d="M11.4 11.6 L12 20.4"/>' +
      '<path d="M12 20.4 L8.8 29.5 M12 20.4 L15.4 29.5"/>' +
      '<path d="M11.6 13.4 L7.4 9.6"/><path d="M12 13.4 L16.2 9.6"/>'
    ) +
    '<circle class="pc-tear t1" cx="7.6" cy="11" r="1.5" fill="currentColor"/>' +
    '<circle class="pc-tear t2" cx="14.4" cy="11" r="1.5" fill="currentColor"/>' +
  '</svg>';
  /* 한 깃발의 사람들 — 1등은 절반이 만세, 꼴찌는 전부 운다 */
  function folksHtml(n, rank, strong) {
    if (rank === "won") return PARTY.repeat(n);        // 이긴 깃발은 전원 만세
    if (rank === "lost") return CRY.repeat(n);         // 진 깃발은 전원 눈물
    if (rank === "low") return CRY.repeat(n);
    /* 파티는 크게 앞설 때만 — 한두 걸음 앞섰다고 잔치를 벌이면 미는 것처럼 보인다(26.9.20) */
    if (rank === "top" && strong) { const party = Math.ceil(n / 2); return PARTY.repeat(party) + FOLK.repeat(n - party); }
    /* 경합·중간은 절반이 주먹 쥐고 힘내고 절반은 계속 부른다 — 경합끼리는 완전히 같은 몸짓이어야 한다(26.9.20) */
    const fight = Math.ceil(n / 2);
    return FIGHT.repeat(fight) + FOLK.repeat(n - fight);
  }
  /* 🏳️ 깃발 — 장대에 천이 나부낀다(천은 CSS 로 흔든다) */
  const FLAG = '<svg class="pc-flag" viewBox="0 0 22 30" aria-hidden="true">' +
    '<path class="pc-pole" d="M4 29 L4 2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
    '<path class="pc-cloth" d="M4 3.4 C9 1.4 13 5.4 19 3.4 L19 12 C13 14 9 10 4 12 Z" fill="currentColor"/>' +
  '</svg>';

  /* 선택지 색 — 깃발마다 다른 색(사장님: 사람·깃발은 원래대로). 판세는 딱지(유력·경합)와 높낮이가 말한다. */
  const HUES = [212, 344, 152, 38, 276, 190, 18, 96];
  const hueOf = (i) => HUES[i % HUES.length];

  /* 사람 수 = 비율(0~100) → 2~10명. 0% 라도 깃발지기 한 명은 남는다(텅 빈 깃발 대사가 살아야 한다).
     26.9.20 사장님: 「비율에 따라 사람 숫자가 더 늘어나는 구조로」 — 1등과 꼴찌의 머릿수 차이가 한눈에 보이게 폭을 넓혔다. */
  const folkCount = (p) => Math.max(1, Math.min(10, 1 + Math.round((p || 0) / 100 * 9)));
  /* 깃발 높이 = 비율(26.9.20 사장님: 「비율에 따라 깃발의 높낮이가 달라지게」). 22px(텅 빔) ~ 54px(독식). */
  const flagH = (p) => Math.round(22 + Math.max(0, Math.min(100, p || 0)) * 0.32);

  /* 🏅 누가 파티하고 누가 우는가 — 비율 차이로 정한다(26.9.20 사장님: 「50 대 50 인데 왜 파티 중이야」).
     · top(파티)  : 2등보다 8%p 이상 앞선 단독 선두일 때만. 동률이면 아무도 파티하지 않는다.
     · low(울음)  : 선두보다 12%p 이상 뒤처진 꼴찌(동률 꼴찌면 함께 운다).
     · mid(파이팅): 그 밖에 전부 — 팽팽하면 다 같이 주먹 쥐고 힘낸다. */
  function ranksOf(list, done) {
    /* 🏁 정산이 끝났으면 순위가 아니라 결과다 — 맞힌 깃발은 won, 나머지는 lost(26.9.20 사장님) */
    if (done && done.winner != null) {
      return list.map(o => String(o.id) === String(done.winner) ? "won" : "lost");
    }
    const ps = list.map(o => Math.round(o.p || 0));
    const hi = Math.max(...ps), lo = Math.min(...ps);
    const leaders = ps.filter(p => p === hi).length;
    const second = ps.filter(p => p !== hi).length ? Math.max(...ps.filter(p => p !== hi)) : hi;
    const topOK = leaders === 1 && hi > second;             // 조금이라도 앞선 단독 선두면 '유력'(26.9.20 사장님)
    const lowOK = (hi - lo) >= 12;                          // 선두와 12%p 넘게 벌어져야 '열세'
    const tieCount = ps.filter(p => (hi - p) <= 3).length;  // 선두권(3%p 이내) 머릿수
    return ps.map(p => {
      if (topOK && p === hi) return "top";
      /* 동률 선두가 둘 이상이면 '경합' */
      if (!topOK && tieCount >= 2 && (hi - p) <= 3) return "tie";
      if (lowOK && p === lo) return "low";
      return "mid";
    });
  }
  /* 🏷️ 상태 딱지(26.9.20 사장님: 「마감도 안 됐는데 왜 왕관이야 — 유력, 비등비등하면 경합」)
     · 진행 중 단독 선두 = 유력 / 팽팽하면 선두권 = 경합 / 끝난 판의 정답 = 적중.
     왕관은 정산이 끝난 판에서만 뜬다. */
  function badgeOf(rank) {
    if (rank === "won") return { t: "적중", c: "win" };
    if (rank === "top") return { t: "유력", c: "lead" };
    if (rank === "tie") return { t: "경합", c: "tight" };
    return null;
  }
  const badgeHtml = (b) => b ? `<span class="pc-badge pc-b-${b.c}">${b.t}</span>` : "";
  /* o: { outcomes:[{id,label,p}], mine:<선택한 outcome id|null>, max:노출 깃발 수(기본 4), compact:true 면 라벨 짧게 } */
  /* 🧍 줄서기용 사람 — 가로로 늘어서니 몸을 작게, 줄 서서 발을 구른다 */
  const QMAN = '<svg class="pc-qman" viewBox="0 0 16 24" aria-hidden="true">' +
    '<g class="pc-qbody" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="8" cy="5" r="3" fill="currentColor" stroke="none"/>' +
      '<path d="M8 8.4 L8 15.6"/><path d="M8 15.6 L5.4 22 M8 15.6 L10.8 22"/>' +
    '</g></svg>';
  const qCount = (p) => Math.max(1, Math.min(16, Math.round((p || 0) / 100 * 26) || 1));

  /* 🚶 줄서기 판 — 선택지가 많을 때(6개 이상) 깃발 대신 이 그림을 쓴다(26.9.20 사장님:
     「깃발만 고집할 필요 없다, 다지선다가 많아지면 최적화된 걸로」).
     선택지마다 창구 하나에 줄이 서고, 줄 길이가 곧 비율이다. 세로로 쌓이니 20개도 읽힌다. */
  function queueHtml(o, sorted, ranks, rest) {
    const rows = sorted.map((oc, i) => {
      const p = Math.round(oc.p || 0);
      const rank = ranks[i];
      const mine = o.mine != null && String(o.mine) === String(oc.id);
      const isOtherC = oc.id === "__other";
      const n = isOtherC ? 2 : qCount(p);
      const strong = rank === "top" && (p - Math.max(...sorted.filter(x => x !== oc).map(x => Math.round(x.p || 0)), 0)) >= 8;
      return `<div class="pc-camp pc-q ${"pc-" + rank}${strong ? " pc-strong" : ""}${mine ? " pc-mine" : ""}${isOtherC ? " pc-other" : ""}"
        data-oc="${esc(oc.id)}" data-p="${p}" data-rank="${rank}" data-strong="${strong ? 1 : 0}" data-label="${esc(oc.label || "")}"
        style="--pc-h:${isOtherC ? 220 : hueOf(i)}">
        <span class="pc-qlab pc-lab">${esc(oc.label || "")}</span>
        <div class="pc-qline"><span class="pc-bub" aria-hidden="true"></span><i class="pc-desk"></i><span class="pc-folks">${QMAN.repeat(n)}</span></div>
        <b class="pc-pct">${p}%</b>${isOtherC ? "" : badgeHtml(badgeOf(rank))}
      </div>`;
    }).join("");
    return `<div class="pc pc-queue${o.resolved ? " pc-done" : ""}"${o.mid ? ` data-mid="${esc(o.mid)}"` : ""}>
      ${rows}
      ${rest ? `<div class="pc-rest">${rest}</div>` : ""}
    </div>`;
  }

  function html(o) {
    o = o || {};
    const all = (o.outcomes || []).filter(Boolean);
    if (!all.length) return "";
    /* 📏 깃발이 너무 많으면 이름표가 사라지고 사람이 뭉개진다(26.9.20 QA: 10개를 폰에 세우면 깃발 폭 21px).
       화면 폭이 허락하는 만큼만 세운다 — 깃발 하나에 최소 62px. */
    const wide = o.width || window.innerWidth || 375;
    const fit = Math.max(2, Math.floor((wide - 24) / 62));
    const max = Math.min(o.max || 4, fit);
    const sorted = all.slice().sort((a, b) => (b.p || 0) - (a.p || 0));

    /* 🏕️ 선택지가 많은 판(스포츠 우승팀 등 20~30개) — 폴리마켓처럼 주요 몇 개만 세우고
       나머지는 「기타」 깃발 하나로 묶는다(26.9.20 사장님). 기타는 비율을 합쳐 높이·사람 수에 반영하되
       유력·경합 같은 판세 딱지는 달지 않는다(여럿을 뭉친 자리라 순위로 다룰 수 없다).
       상세(scroll:true)에선 접지 않고 전부 세운 뒤 옆으로 밀어 본다. */
    /* 🔀 선택지 수에 맞는 그림을 고른다(26.9.20 사장님) —
       2~5개: 깃발 진영(사람이 깃발 아래 모여 호객) / 6개 이상: 줄서기(창구마다 줄, 세로로 쌓여 20개도 읽힌다). */
    const QUEUE_FROM = 6;
    if (!o.force && sorted.length >= QUEUE_FROM) {
      const cap = o.queueMax || 8;                       // 줄은 세로로 쌓이니 넉넉히, 넘치면 기타로 묶는다
      let qshow = sorted, qrest = "";
      if (sorted.length > cap) {
        qshow = sorted.slice(0, cap - 1);
        const others2 = sorted.slice(cap - 1);
        qshow = qshow.concat([{ id: "__other", label: `기타 ${others2.length}곳`, p: others2.reduce((a, x) => a + (x.p || 0), 0) }]);
        qrest = `기타 ${others2.length}곳은 아래 목록에서`;
      }
      const qranks = ranksOf(qshow.filter(x => x.id !== "__other"), o.resolved ? { winner: o.winner } : null);
      const ranks2 = qshow.map((x, i) => x.id === "__other" ? "mid" : qranks[i]);
      return queueHtml(o, qshow, ranks2, qrest);
    }

    let show, others = [];
    if (o.scroll) { show = sorted; }
    else if (sorted.length > max) { show = sorted.slice(0, Math.max(1, max - 1)); others = sorted.slice(Math.max(1, max - 1)); }
    else { show = sorted; }

    const ranks = ranksOf(show, o.resolved ? { winner: o.winner } : null);
    const camp = (oc, i, rank, hue) => {
      const p = Math.round(oc.p || 0);
      const isOtherC = oc.id === "__other";
      /* 기타는 여럿을 묶은 자리다 — 합계가 크다고 깃대를 높이거나 사람을 채우면 「기타가 1등」처럼 보인다(26.9.20 QA).
         자리는 작게 고정하고, 합계는 숫자로만 말한다. */
      const n = isOtherC ? 2 : folkCount(p);
      const mine = o.mine != null && String(o.mine) === String(oc.id);
      const strong = rank === "top" && (p - Math.max(...show.filter(x => x !== oc).map(x => Math.round(x.p || 0)), 0)) >= 8;
      const isOther = isOtherC;
      /* flex 비중을 비율에 맞춰 — 붐비는 깃발이 자리를 더 차지한다(몰림이 눈에 보이게, 최소 폭은 보장) */
      return `<div class="pc-camp pc-${rank}${strong ? " pc-strong" : ""}${mine ? " pc-mine" : ""}${isOther ? " pc-other" : ""}" data-oc="${esc(oc.id)}" data-p="${p}" data-rank="${rank}"
        data-strong="${strong ? 1 : 0}" data-label="${esc(oc.label || "")}" style="--pc-h:${hue};--pc-fh:${isOtherC ? 22 : flagH(p)}px;flex:${isOtherC ? 18 : Math.max(1, p) + 14} 1 0">
        <span class="pc-bub" aria-hidden="true"></span>
        <div class="pc-stage">${FLAG}<span class="pc-folks">${folksHtml(n, rank, strong)}</span>
          <i class="pc-conf c1"></i><i class="pc-conf c2"></i><i class="pc-conf c3"></i><i class="pc-conf c4"></i></div>
        <div class="pc-meta">${o.labels === false ? "" : `<span class="pc-lab">${esc(oc.label || "")}</span>`}<b class="pc-pct">${p}%</b>${isOther ? "" : badgeHtml(badgeOf(rank))}</div>
      </div>`;
    };
    let camps = show.map((oc, i) => camp(oc, i, ranks[i], hueOf(all.indexOf(oc)))).join("");
    if (others.length) {
      const sum = others.reduce((a, x) => a + (x.p || 0), 0);
      camps += camp({ id: "__other", label: `기타 ${others.length}곳`, p: sum }, show.length, "mid", 220);
    }
    return `<div class="pc${o.resolved ? " pc-done" : ""}${o.scroll ? " pc-scroll" : ""}"${o.mid ? ` data-mid="${esc(o.mid)}"` : ""}>
      <div class="pc-ground">${camps}</div>
      ${others.length ? `<div class="pc-rest">기타 ${others.length}곳은 아래 목록에서</div>` : ""}
    </div>`;
  }

  /* 컨테이너에 붙이기 — 이후 update 로 숫자만 갈아끼운다 */
  function mount(el, o) { if (!el) return; el.innerHTML = html(o); }

  /* 비율이 바뀌면 사람 수·폭·퍼센트를 따라가게 한다(상세는 30초마다 새로 읽는다) */
  function update(root, outcomes, mine, done) {
    if (!root) return;
    if (done && done.winner != null) root.classList.add("pc-done");
    /* 순위가 바뀌면 몸짓도 바뀐다 — 앞서면 파티, 크게 밀리면 울음, 팽팽하면 다 같이 파이팅(26.9.20) */
    const list = (outcomes || []).slice();
    const rk = ranksOf(list, done);
    const rankById = {};
    list.forEach((oc, i) => { rankById[String(oc.id)] = rk[i]; });
    (outcomes || []).forEach((oc) => {
      const camp = root.querySelector(`.pc-camp[data-oc="${CSS.escape(String(oc.id))}"]`);
      if (!camp) return;
      const p = Math.round(oc.p || 0);
      camp.dataset.p = p;
      camp.style.flex = `${Math.max(1, p) + 14} 1 0`;
      camp.style.setProperty("--pc-fh", flagH(p) + "px");   // 비율이 오르면 깃발도 높아진다
      const pct = camp.querySelector(".pc-pct"); if (pct) pct.textContent = p + "%";
      const rank = rankById[String(oc.id)] || "mid";
      const others = list.filter(x => String(x.id) !== String(oc.id)).map(x => Math.round(x.p || 0));
      const strong = rank === "top" && (p - Math.max(...others, 0)) >= 8;   // 파티는 크게 앞설 때만
      if (camp.dataset.rank !== rank) {
        camp.classList.remove("pc-top", "pc-tie", "pc-mid", "pc-low", "pc-won", "pc-lost");
        camp.classList.add("pc-" + rank);
        camp.dataset.rank = rank;
        camp.classList.toggle("pc-strong", !!strong);
        camp.dataset.strong = strong ? 1 : 0;
        const fk = camp.querySelector(".pc-folks");
        if (fk) fk.innerHTML = folksHtml(folkCount(p), rank, strong);  // 몸짓이 바뀌니 통째로 다시 세운다
      } else if (String(camp.dataset.strong || 0) !== String(strong ? 1 : 0)) {
        camp.classList.toggle("pc-strong", !!strong);                  // 앞선 폭이 바뀌면 파티 여부만 다시
        camp.dataset.strong = strong ? 1 : 0;
        const fk = camp.querySelector(".pc-folks");
        if (fk) fk.innerHTML = folksHtml(folkCount(p), rank, strong);
      } else {
        const folks = camp.querySelector(".pc-folks");
        if (folks) {
          const want = folkCount(p), have = folks.querySelectorAll(".pc-folk").length;
          if (want > have) folks.insertAdjacentHTML("beforeend", folksHtml(want - have, rank, strong));
          else for (let i = 0; i < have - want; i++) folks.lastElementChild && folks.lastElementChild.remove();
        }
      }
      camp.classList.toggle("pc-mine", mine != null && String(mine) === String(oc.id));
      /* 상태 딱지도 다시 — 판세가 바뀌면 유력·경합이 옮겨 다닌다 */
      const meta = camp.querySelector(".pc-meta");
      if (meta) {
        const old = meta.querySelector(".pc-badge"); if (old) old.remove();
        const bh = badgeHtml(badgeOf(rank));
        if (bh) meta.insertAdjacentHTML("beforeend", bh);
      }
    });
  }

  /* 🧠 그 예측 주제에 맞춘 대사 — 엣지 함수 crowd-lines 가 마켓마다 한 번 만들어 market_crowd_lines 에 넣어 둔다.
     (26.9.20 사장님: 「주제에 해당하는 대화들이 오갈 수 있는 시스템」)
     판마다 한 번만 읽고 캐시한다. 없으면 공용 창고(js/predict-lines.js)로 돈다 — 화면은 어느 쪽이든 똑같이 움직인다. */
  const TOPIC = {}, TOPIC_P = {};
  /* 센 욕이 새어 나오면 초성으로(서버가 이미 바꿔 저장하지만 옛 행 대비 한 번 더) */
  const SOFT = [[/씨발|시발|씨바|시바/g, "ㅅㅂ"], [/존나|존내|졸라/g, "ㅈㄴ"], [/썅|씹/g, "ㅆ"], [/개새끼|개새기/g, "ㄱㅅㄲ"],
    [/새끼|색기/g, "ㅅㄲ"], [/좆|좃/g, "ㅈ"], [/지랄/g, "ㅈㄹ"], [/병신/g, "ㅂㅅ"], [/염병/g, "ㅇㅂ"]];
  const soft1 = (t) => SOFT.reduce((x, [re, to]) => x.replace(re, to), String(t || ""));
  function softAll(v) {
    if (Array.isArray(v)) return v.map(softAll);
    if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = softAll(v[k]); return o; }
    return soft1(v);
  }
  function topicOf(camp) {
    const board = camp.closest(".pc"); if (!board) return null;
    const mid = board.dataset.mid; if (!mid) return null;
    if (TOPIC[mid] !== undefined) return TOPIC[mid];
    if (!TOPIC_P[mid] && window.supabaseClient) {
      TOPIC_P[mid] = window.supabaseClient.from("market_crowd_lines").select("lines").eq("market_id", Number(mid)).maybeSingle()
        .then(r => { TOPIC[mid] = softAll((r && r.data && r.data.lines) || null); }, () => { TOPIC[mid] = null; });
    }
    return null;   // 아직 안 왔으면 이번 턴은 공용 창고로
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
    const T = topicOf(camp);
    if (rank === "won") return pickOne(T && T.won, L().WON);
    if (rank === "lost") return pickOne(T && T.lost, L().LOST);
    /* 🧠 그 예측 주제로 만든 대사를 먼저 섞는다 — 선택지 이름을 들먹이는 말이 가장 재밌다(26.9.20 사장님) */
    const key = camp.dataset.label || "";
    if (T && T.by_label && T.by_label[key] && Math.random() < .35) return draw("bl" + key, T.by_label[key]);
    if (Math.random() < .35) return pickOne(T && T.call, L().CALL);
    const K = rank.toUpperCase();
    return pickOne(T && T[rank], L()[K] || L().MID);
  }
  /* 주제 대사가 있으면 그걸(60%), 없으면 공용 창고 */
  function pickOne(topicArr, fallback) {
    if (topicArr && topicArr.length && Math.random() < .6) return draw("t" + topicArr.length + topicArr[0], topicArr);
    return draw("s" + (fallback && fallback[0]), fallback);
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
    const T = topicOf(from);
    say(from, pickOne(T && T.defect_leave, L().DEFECT_LEAVE), 1600);
    setTimeout(() => say(from, pickOne(T && T.defect_stay, L().DEFECT_STAY), 1800), 700);
    setTimeout(() => {
      ghost.remove();
      folk.classList.remove("pc-gone");
      say(to, pickOne(topicOf(to) && topicOf(to).defect_welcome, L().DEFECT_WELCOME), 1800);
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
      if (roll < .22 && camps.length > 1 && !board.classList.contains("pc-done")) {   // 갈아타기(끝난 판은 안 한다)
        board._busy = true;
        defect(board);
        setTimeout(() => { board._busy = false; }, 3200);
      } else if (roll < .5 && camps.length > 1) {               // 주고받기(두 깃발이 한마디씩)
        const T = topicOf(camps[0]);
        const doneBoard = board.classList.contains("pc-done");
        const bank = doneBoard ? L().DONE_DUO : ((T && T.duo && T.duo.length && Math.random() < .6) ? T.duo : L().DUO);
        const pair = draw(doneBoard ? "DDUO" : (bank === (T && T.duo) ? "tduo" + board.dataset.mid : "DUO"), bank);
        if (!pair || pair.length < 2) return;
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
