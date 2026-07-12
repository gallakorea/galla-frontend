/* =========================================================
   🛠 갈라 관제센터 — 접근제어 + 모듈 라우팅
   P1: 대시보드(트래픽). P2~ 콘텐츠/회원/정산/AS/업로드/운영
   ========================================================= */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));
  const fmt = (n) => (n || 0).toLocaleString();
  let sb, ME = null;
  const main = () => document.getElementById("ad-main");

  function countUp(el, target) {
    if (!el) return;
    const dur = 700, t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * e).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  async function boot() {
    sb = await waitForSupabaseClient();
    const { data: s } = await sb.auth.getSession();
    if (!s?.session) { location.href = "login.html?returnTo=%2Fadmin.html"; return; }
    ME = s.session.user.id;
    const { data: prof } = await sb.from("user_profiles").select("admin_flag").eq("user_id", ME).maybeSingle();
    if (!prof?.admin_flag) { alert("관리자 전용 페이지입니다."); location.href = "index.html"; return; }
    document.getElementById("admin-gate").remove();
    document.getElementById("admin-app").hidden = false;
    wireShell();
    route("dashboard");
    pollOnline();
  }

  function wireShell() {
    const sidebar = $("#ad-sidebar"), scrim = $("#ad-scrim");
    const closeDrawer = () => { sidebar.classList.remove("open"); scrim.classList.remove("show"); };
    $("#ad-burger").onclick = () => { sidebar.classList.toggle("open"); scrim.classList.toggle("show"); };
    scrim.onclick = closeDrawer;
    document.querySelectorAll(".ad-navitem").forEach(b => b.onclick = () => {
      document.querySelectorAll(".ad-navitem").forEach(x => x.classList.remove("active"));
      b.classList.add("active"); closeDrawer(); route(b.dataset.mod);
    });
  }

  async function pollOnline() {
    const paint = async () => {
      const { data } = await sb.rpc("admin_traffic");
      const el = $("#ad-online");
      if (el && data?.ok) el.innerHTML = `<span class="dotlive"></span> 실시간 ${fmt(data.realtime)}명`;
    };
    paint(); setInterval(paint, 60000);
  }

  const MODS = {
    dashboard: renderDashboard,
    content: placeholder("📝 콘텐츠 관리", "P2 — 통합 목록·인사이트·수정/삭제·인기관리"),
    members: placeholder("👥 회원 관리", "P3 — 우수/요주의/블랙리스트·경고/정지"),
    reports: placeholder("🚨 신고·모더레이션", "P2 — 신고 큐 처리"),
    settle: placeholder("💰 정산·출금", "P4 — 출금 승인/거절"),
    support: placeholder("🎧 고객지원", "P4 — AS 티켓"),
    upload: placeholder("⬆️ 직접 업로드", "P4 — 관리자 콘텐츠 발행"),
    ops: placeholder("⚙️ 운영·감사", "P4 — 공지·시즌정산·감사로그"),
  };
  function placeholder(title, desc) {
    return async () => { main().innerHTML = `<h1 class="ad-h1">${title}</h1><div class="ad-soon">🚧 ${esc(desc)}</div>`; };
  }
  function route(mod) { (MODS[mod] || MODS.dashboard)(); }

  async function renderDashboard() {
    main().innerHTML = `<div class="ad-loading">집계 중…</div>`;
    const [{ data: t }, { data: g }] = await Promise.all([sb.rpc("admin_traffic"), sb.rpc("admin_growth")]);
    if (!t?.ok) { main().innerHTML = `<div class="ad-soon">데이터를 불러오지 못했어요.</div>`; return; }
    const td = t.today || {};
    const kpi = (label, id, hint, accent) => `
      <div class="ad-kpi ${accent || ""}"><div class="ad-kpi-l">${label}</div>
        <div class="ad-kpi-v" id="${id}">0</div><div class="ad-kpi-h">${hint || ""}</div></div>`;
    main().innerHTML = `
      <h1 class="ad-h1">📊 대시보드</h1>
      <div class="ad-kpis">
        ${kpi("실시간 접속 (1h)", "k-rt", `최근 5분 ${fmt(t.online5m)}명`, "live")}
        ${kpi("DAU (오늘)", "k-dau", "오늘 활동 유저")}
        ${kpi("WAU (7일)", "k-wau", "주간 활동 유저")}
        ${kpi("MAU (30일)", "k-mau", "월간 활동 유저")}
        ${kpi("누적 회원", "k-total", `오늘 가입 +${fmt(td.signups)}`, "gold")}
      </div>
      <div class="ad-grid2">
        <div class="ad-card"><div class="ad-card-h">⏱ 시간당 활동 (최근 24h)</div>
          <div class="ad-chart">${window.AdminCharts.lineChart(t.hourly || [], { color: "#5b8cff" })}</div></div>
        <div class="ad-card"><div class="ad-card-h">📈 성장 추이 (14일) <span class="ad-legend"><i style="background:#f5cf6b"></i>가입 <i style="background:#33d17a"></i>DAU</span></div>
          <div class="ad-chart">${window.AdminCharts.dualLine((g?.days || []).map(d => ({ label: d.d, a: d.signups, b: d.dau })), {})}</div></div>
      </div>
      <div class="ad-card"><div class="ad-card-h">🔥 오늘 활동량</div>
        <div class="ad-mini">
          ${miniStat("📝 갈라 발의", td.issues)}${miniStat("🗳️ 투표", td.votes)}${miniStat("💬 댓글", td.comments)}
          ${miniStat("⚔️ 일기토", td.duels)}${miniStat("📈 예측거래", td.trades)}${miniStat("🙋 신규가입", td.signups)}
        </div></div>`;
    countUp($("#k-rt"), t.realtime); countUp($("#k-dau"), t.dau); countUp($("#k-wau"), t.wau);
    countUp($("#k-mau"), t.mau); countUp($("#k-total"), t.total_users);
  }
  const miniStat = (label, v) => `<div class="ad-mini-i"><div class="ad-mini-v">${fmt(v)}</div><div class="ad-mini-l">${label}</div></div>`;

  window.GALLA_ADMIN = { route };
  boot();
})();
