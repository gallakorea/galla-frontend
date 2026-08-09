/* =========================================================
   📊 내 글 통계 — 이용권(프렌드↑) 혜택
   - window.GALLA_openStats()
   - 잠금 상태에서도 '총합'은 보여준다. 뭘 얻는지 보여야 구독한다.
   ⚠️ 조회수 추이는 스냅샷을 쌓기 시작한 날(2026-08-09)부터만 나온다.
      과거가 없다고 버그가 아니다 — 화면에 그렇게 적어둔다.
   ========================================================= */
(function () {
  const sb = () => window.supabaseClient || window.supabase;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf = (n) => Number(n || 0).toLocaleString();

  function css() {
    if (document.getElementById("stats-css")) return;
    const s = document.createElement("style"); s.id = "stats-css";
    s.textContent = `
      .st-sheet{position:fixed;inset:0;z-index:99997;display:flex;align-items:flex-end;justify-content:center}
      .st-sheet .dim{position:absolute;inset:0;background:rgba(0,0,0,.55)}
      .st-card{position:relative;width:100%;max-width:520px;max-height:86vh;overflow:auto;background:#14151a;
        border-radius:20px 20px 0 0;padding:16px 14px max(14px,env(safe-area-inset-bottom));animation:stUp .24s ease}
      @keyframes stUp{from{transform:translateY(100%)}}
      .st-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
      .st-title{font-weight:900;font-size:17px;color:#f5f5f2}
      .st-range{display:flex;gap:6px}
      .st-rb{border:none;background:rgba(255,255,255,.06);color:#c9d1e0;font-weight:800;font-size:12px;
        padding:6px 10px;border-radius:9px;cursor:pointer}
      .st-rb.on{background:linear-gradient(135deg,#3d6bff,#5b8cff);color:#fff}
      .st-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
      .st-kpi{background:linear-gradient(180deg,#16171c,#101116);border:1px solid rgba(255,255,255,.08);
        border-radius:14px;padding:12px 10px;text-align:center}
      .st-kpi b{display:block;font-size:19px;font-weight:900;color:#f0f0f2;font-variant-numeric:tabular-nums}
      .st-kpi span{font-size:11px;font-weight:800;color:#8a8f9a}
      .st-sec{font-size:12px;font-weight:900;color:#8b8b93;margin:14px 2px 8px;letter-spacing:.4px}
      .st-chart{display:flex;align-items:flex-end;gap:3px;height:96px;padding:8px 6px;
        background:rgba(255,255,255,.03);border-radius:12px;border:1px solid rgba(255,255,255,.06)}
      .st-bar{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;gap:2px;height:100%}
      .st-bar i{display:block;border-radius:3px 3px 0 0;min-height:2px}
      .st-bar .b-cm{background:#7c8cff}
      .st-bar .b-vt{background:#4dd8e6}
      .st-bar .b-vw{background:#a78bfa}
      .st-legend{display:flex;gap:12px;margin-top:8px;font-size:11px;font-weight:800;color:#8a8f9a}
      .st-legend i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:4px;vertical-align:-1px}
      .st-row{display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#16171c,#101116);
        border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px 12px;margin-bottom:6px}
      .st-row .t{flex:1;min-width:0;font-weight:800;color:#e9e9ee;font-size:13.5px;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .st-row .m{flex:0 0 auto;font-size:11.5px;font-weight:800;color:#8a8f9a;font-variant-numeric:tabular-nums}
      .st-fac{display:flex;height:26px;border-radius:9px;overflow:hidden;border:1px solid rgba(255,255,255,.08)}
      .st-fac .p{background:linear-gradient(135deg,#3d6bff,#5b8cff)}
      .st-fac .c{background:linear-gradient(135deg,#ff5470,#ff7a5c)}
      .st-fac span{display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#fff}
      .st-note{color:#8a8f9a;font-size:11.5px;line-height:1.6;margin-top:12px}
      .st-lock{background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.28);border-radius:14px;
        padding:16px 14px;text-align:center;margin-top:12px}
      .st-lock b{display:block;color:#c4b5fd;font-size:14px;font-weight:900;margin-bottom:6px}
      .st-lock p{color:#8a8f9a;font-size:12.5px;line-height:1.6;margin:0 0 12px}
      .st-cta{border:none;border-radius:11px;padding:11px 20px;font-weight:900;font-size:13.5px;cursor:pointer;
        background:linear-gradient(135deg,#7c8cff,#a78bfa);color:#fff}
      .st-close{width:100%;margin-top:12px;padding:13px;border:none;border-radius:12px;
        background:rgba(255,255,255,.06);color:#c9d1e0;font-weight:800;cursor:pointer}
      .st-empty{color:#6c7280;font-size:12.5px;padding:10px 2px}
    `;
    document.head.appendChild(s);
  }

  let sheet = null, days = 14, data = null;

  function build() {
    // ⚠️ 문서에서 떨어져 나간 시트를 붙들고 있으면 화면엔 아무것도 안 뜬다.
    //    (다른 코드가 지웠거나 SPA 전환으로 판이 갈린 경우) 연결 여부까지 확인한다.
    if (sheet && sheet.isConnected) return sheet;
    sheet = null;
    css();
    sheet = document.createElement("div");
    sheet.className = "st-sheet";
    sheet.innerHTML = `
      <div class="dim"></div>
      <div class="st-card">
        <div class="st-head">
          <span class="st-title">📊 내 글 통계</span>
          <span class="st-range">
            <button class="st-rb on" data-d="7" type="button">7일</button>
            <button class="st-rb" data-d="14" type="button">14일</button>
            <button class="st-rb" data-d="30" type="button">30일</button>
          </span>
        </div>
        <div id="st-body"></div>
        <button class="st-close" type="button">닫기</button>
      </div>`;
    document.body.appendChild(sheet);
    sheet.querySelector(".dim").onclick = close;
    sheet.querySelector(".st-close").onclick = close;
    sheet.querySelectorAll(".st-rb").forEach(b => b.onclick = () => {
      sheet.querySelectorAll(".st-rb").forEach(x => x.classList.remove("on"));
      b.classList.add("on"); days = Number(b.dataset.d); load();
    });
    return sheet;
  }
  function close() { sheet && sheet.remove(); sheet = null; }

  function chart(daily) {
    if (!daily.length) return `<div class="st-empty">아직 데이터가 없어요</div>`;
    // 세 지표를 한 막대에 쌓는다 — 날짜별 '총 반응량'이 한눈에 보이는 게 먼저다
    const max = Math.max(1, ...daily.map(d => (d.views || 0) + (d.comments || 0) + (d.votes || 0)));
    const bars = daily.map(d => {
      const h = (n) => Math.round((Number(n || 0) / max) * 84);
      return `<span class="st-bar" title="${esc(d.day)} · 조회 ${nf(d.views)} · 댓글 ${nf(d.comments)} · 투표 ${nf(d.votes)}">
        ${d.views ? `<i class="b-vw" style="height:${h(d.views)}px"></i>` : ""}
        ${d.comments ? `<i class="b-cm" style="height:${h(d.comments)}px"></i>` : ""}
        ${d.votes ? `<i class="b-vt" style="height:${h(d.votes)}px"></i>` : ""}
      </span>`;
    }).join("");
    return `<div class="st-chart">${bars}</div>
      <div class="st-legend">
        <span><i style="background:#a78bfa"></i>조회</span>
        <span><i style="background:#7c8cff"></i>댓글</span>
        <span><i style="background:#4dd8e6"></i>투표</span>
      </div>`;
  }

  function render() {
    const body = sheet.querySelector("#st-body");
    if (!data || !data.ok) { body.innerHTML = `<div class="st-empty">통계를 불러오지 못했어요</div>`; return; }
    const t = data.totals || {};
    const kpis = `
      <div class="st-kpis">
        <div class="st-kpi"><b>${nf(t.views)}</b><span>총 조회</span></div>
        <div class="st-kpi"><b>${nf((t.issues || 0) + (t.plaza || 0))}</b><span>내 글</span></div>
        <div class="st-kpi"><b>${nf(t.followers)}</b><span>팔로워</span></div>
      </div>`;

    if (data.locked) {
      body.innerHTML = kpis + `
        <div class="st-lock">
          <b>🔒 추이·글별 성과는 이용권 혜택이에요</b>
          <p>어떤 글이 반응이 좋았는지, 어느 날 사람이 몰렸는지<br>프렌드 이용권부터 볼 수 있어요.</p>
          <button class="st-cta" type="button" id="st-cta">이용권 보기</button>
        </div>`;
      const cta = body.querySelector("#st-cta");
      if (cta) cta.onclick = () => { close(); (window.GALLA_openPlans || window.GALLA_openCharge || function () {})(); };
      return;
    }

    const f = data.factions || { pro: 0, con: 0 };
    const fTot = (f.pro || 0) + (f.con || 0);
    const top = (data.top || []).map(x => `
      <div class="st-row">
        <span class="t">${esc(x.title || "(제목 없음)")}</span>
        <span class="m">👁 ${nf(x.views)} · 💬 ${nf(x.reactions)}</span>
      </div>`).join("") || `<div class="st-empty">아직 쓴 글이 없어요</div>`;

    body.innerHTML = kpis +
      `<div class="st-sec">최근 ${data.days}일 반응</div>${chart(data.daily || [])}` +
      `<div class="st-sec">반응 좋은 글</div>${top}` +
      (fTot ? `<div class="st-sec">내 이슈에 모인 진영</div>
        <div class="st-fac">
          <span class="p" style="width:${Math.round((f.pro / fTot) * 100)}%">찬 ${nf(f.pro)}</span>
          <span class="c" style="width:${Math.round((f.con / fTot) * 100)}%">반 ${nf(f.con)}</span>
        </div>` : "") +
      `<div class="st-note">💬 댓글·투표·팔로워는 지난 기록까지 보여요.<br>
        👁 조회수 추이는 <b>2026년 8월 9일부터</b> 쌓기 시작해서, 그 이전 날짜는 0으로 보여요.</div>`;
  }

  async function load() {
    const body = sheet.querySelector("#st-body");
    body.innerHTML = `<div class="st-empty">불러오는 중…</div>`;
    try {
      const { data: d, error } = await sb().rpc("my_stats", { p_days: days });
      if (error) throw error;
      data = d;
    } catch (e) { data = null; }
    render();
  }

  window.GALLA_openStats = async function () {
    const { data: s } = await sb().auth.getSession();
    if (!s?.session) { (window.GALLA_nav || function (u) { location.href = u; })("login.html"); return; }
    build();
    await load();
  };
})();
