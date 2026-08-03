/* =========================================================
   🛠 갈라 관제센터 — 접근제어 + 전 모듈(대시보드/콘텐츠/회원/신고/정산/AS/업로드/운영)
   ========================================================= */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));
  const fmt = (n) => (n || 0).toLocaleString();
  const ago = (ts) => { if (!ts) return ""; const s = (Date.now() - new Date(ts).getTime()) / 1000; if (s < 60) return "방금"; if (s < 3600) return Math.floor(s / 60) + "분 전"; if (s < 86400) return Math.floor(s / 3600) + "시간 전"; return Math.floor(s / 86400) + "일 전"; };
  let sb, ME = null;
  const main = () => document.getElementById("ad-main");
  const rpc = (fn, args) => sb.rpc(fn, args).then(r => r.data);

  function countUp(el, target) {
    if (!el) return; const t0 = performance.now();
    const step = (t) => { const p = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(target * e).toLocaleString(); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function toast(m) { const d = document.createElement("div"); d.className = "ad-toast"; d.textContent = m; document.body.appendChild(d); setTimeout(() => d.remove(), 2200); }
  function modal(html) {
    const w = document.createElement("div"); w.className = "ad-modal";
    w.innerHTML = `<div class="ad-modal-dim"></div><div class="ad-modal-box">${html}</div>`;
    document.body.appendChild(w);
    w.querySelector(".ad-modal-dim").onclick = () => w.remove();
    return w;
  }

  async function boot() {
    sb = await waitForSupabaseClient();
    const { data: s } = await sb.auth.getSession();
    if (!s?.session) { location.href = "admin-login.html"; return; }
    ME = s.session.user.id;
    const { data: prof } = await sb.from("user_profiles").select("admin_flag").eq("user_id", ME).maybeSingle();
    if (!prof?.admin_flag) { location.href = "admin-login.html"; return; }
    document.getElementById("admin-gate").remove();
    document.getElementById("admin-app").hidden = false;
    wireShell(); route("dashboard"); pollOnline();
  }
  function wireShell() {
    const sidebar = $("#ad-sidebar"), scrim = $("#ad-scrim");
    const close = () => { sidebar.classList.remove("open"); scrim.classList.remove("show"); };
    $("#ad-burger").onclick = () => { sidebar.classList.toggle("open"); scrim.classList.toggle("show"); };
    scrim.onclick = close;
    document.querySelectorAll(".ad-navitem").forEach(b => b.onclick = () => {
      document.querySelectorAll(".ad-navitem").forEach(x => x.classList.remove("active"));
      b.classList.add("active"); close(); route(b.dataset.mod);
    });
  }
  async function pollOnline() {
    const paint = async () => { const d = await rpc("admin_traffic"); const el = $("#ad-online"); if (el && d?.ok) el.innerHTML = `<span class="dotlive"></span> 실시간 ${fmt(d.realtime)}명`; };
    paint(); setInterval(paint, 60000);
  }
  const MODS = { dashboard: renderDashboard, content: renderContent, members: renderMembers, reports: renderReports, tips: renderTips, bugs: renderBugs, bughunter: renderBugHunter, errors: renderErrors, settle: renderSettle, support: renderSupport, brain: renderBrain, upload: renderUpload, ops: renderOps };
  function route(mod) { (MODS[mod] || renderDashboard)(); }
  // 사이드바 하이라이트 동기화 + 라우팅 (대시보드 카드 클릭 등에서 사용)
  function navTo(mod) {
    document.querySelectorAll(".ad-navitem").forEach(x => x.classList.toggle("active", x.dataset.mod === mod));
    route(mod);
  }

  // ─────────── 대시보드 ───────────
  async function renderDashboard() {
    main().innerHTML = `<div class="ad-loading">집계 중…</div>`;
    const [t, g] = await Promise.all([rpc("admin_traffic"), rpc("admin_growth")]);
    if (!t?.ok) { main().innerHTML = `<div class="ad-soon">데이터를 불러오지 못했어요.</div>`; return; }
    const td = t.today || {};
    const kpi = (l, id, h, a, go) => `<div class="ad-kpi ${a || ""}${go ? " clickable" : ""}"${go ? ` data-go="${go}"` : ""}><div class="ad-kpi-l">${l}</div><div class="ad-kpi-v" id="${id}">0</div><div class="ad-kpi-h">${h || ""}</div></div>`;
    const mini = (l, v, go) => `<div class="ad-mini-i${go ? " clickable" : ""}"${go ? ` data-go="${go}"` : ""}><div class="ad-mini-v">${fmt(v)}</div><div class="ad-mini-l">${l}</div></div>`;
    main().innerHTML = `<h1 class="ad-h1">📊 대시보드</h1>
      <div class="ad-kpis">
        ${kpi("실시간 접속 (1h)", "k-rt", `최근 5분 ${fmt(t.online5m)}명`, "live")}
        ${kpi("DAU (오늘)", "k-dau", "오늘 활동 유저", "", "members")}${kpi("WAU (7일)", "k-wau", "주간", "", "members")}${kpi("MAU (30일)", "k-mau", "월간", "", "members")}
        ${kpi("누적 회원", "k-total", `오늘 가입 +${fmt(td.signups)}`, "gold", "members")}</div>
      <div class="ad-card ad-live"><div class="ad-card-h">🟢 실시간 접속 현황 <span class="ad-live-refresh">2분 이내 활동 기준 · 자동 갱신</span></div>
        <div id="ad-presence"><div class="ad-loading">접속 현황 집계 중…</div></div></div>
      <div class="ad-grid2">
        <div class="ad-card"><div class="ad-card-h">⏱ 시간당 활동 (최근 24h)</div><div class="ad-chart">${AdminCharts.lineChart(t.hourly || [], { color: "#5b8cff" })}</div></div>
        <div class="ad-card"><div class="ad-card-h">📈 성장 추이 (14일) <span class="ad-legend"><i style="background:#c9d1e0"></i>가입 <i style="background:#33d17a"></i>DAU</span></div><div class="ad-chart">${AdminCharts.dualLine((g?.days || []).map(d => ({ label: d.d, a: d.signups, b: d.dau })), {})}</div></div></div>
      <div class="ad-card"><div class="ad-card-h">🔥 오늘 활동량</div><div class="ad-mini">
        ${mini("📝 갈라 발의", td.issues, "content")}${mini("🗳️ 투표", td.votes)}${mini("💬 댓글", td.comments, "content")}${mini("⚔️ 일기토", td.duels, "content")}${mini("📈 예측거래", td.trades, "content")}${mini("🙋 신규가입", td.signups, "members")}</div></div>
      <div class="ad-card" id="ad-ga"><div class="ad-card-h">🌐 Google Analytics <span class="ad-live-refresh" id="ga-meta">불러오는 중…</span></div>
        <div id="ga-body"><div class="ad-loading">GA 지표 집계 중…</div></div></div>`;
    countUp($("#k-rt"), t.realtime); countUp($("#k-dau"), t.dau); countUp($("#k-wau"), t.wau); countUp($("#k-mau"), t.mau); countUp($("#k-total"), t.total_users);
    paintGA();
    // 카드 클릭 → 해당 모듈로 즉시 이동 (영속 #ad-main에 1회만 위임 등록)
    if (!main().__goWired) { main().__goWired = true; main().addEventListener("click", e => { const g = e.target.closest("[data-go]"); if (g) navTo(g.dataset.go); }); }
    // 실시간 접속 현황(회원 명단/비회원 수/지역) — 최초 렌더 + 20초 자동 갱신
    paintPresence();
    clearInterval(dashPresenceTimer);
    dashPresenceTimer = setInterval(() => { if ($("#ad-presence")) paintPresence(); else clearInterval(dashPresenceTimer); }, 20000);
  }
  // 🌐 Google Analytics 패널 — 캐시된 GA4 지표(admin_ga). 미연동이면 안내.
  async function paintGA() {
    const body = $("#ga-body"), meta = $("#ga-meta"); if (!body) return;
    const g = await rpc("admin_ga");
    if (!g?.ok) { body.innerHTML = `<div class="ad-soon">GA 데이터를 불러오지 못했어요.</div>`; if (meta) meta.textContent = ""; return; }
    if (!g.configured) {
      if (meta) meta.textContent = "미연동";
      body.innerHTML = `<div class="ad-ga-setup">
        <p><b>GA4 연동이 아직 설정되지 않았어요.</b> 아래 3단계로 연결하면 실시간 접속·28일 방문 지표가 여기 표시됩니다.</p>
        <ol class="ad-ga-steps">
          <li>GCP에서 <b>서비스계정</b> 생성 → <b>Analytics Data API</b> 사용 설정</li>
          <li>GA4 속성 관리 → 위 서비스계정을 <b>뷰어</b>로 추가, <b>숫자 Property ID</b> 확인</li>
          <li>Supabase Secrets에 <code>GA_SA_JSON</code>·<code>GA_PROPERTY_ID</code> 저장 → <code>ga-sync</code> 배포·크론</li>
        </ol>
        <a class="ad-ga-link" href="https://analytics.google.com/" target="_blank" rel="noopener">↗ GA4 대시보드 열기</a>
      </div>`;
      return;
    }
    const r = g.realtime || {}, rep = g.report || {}, tot = rep.totals || {};
    const ago = g.report_at ? relTime(g.report_at) : "";
    if (meta) meta.textContent = `업데이트 ${ago}`;
    const cell = (l, v) => `<div class="ad-mini-i"><div class="ad-mini-v">${fmt(v || 0)}</div><div class="ad-mini-l">${l}</div></div>`;
    const days = (rep.days || []).map(d => ({ label: (d.d || "").slice(4), a: d.users, b: d.sessions }));
    body.innerHTML = `<div class="ad-mini" style="margin-bottom:10px">
        ${cell("🟢 실시간 접속", r.total)}${cell("28일 방문자", tot.users)}${cell("28일 세션", tot.sessions)}${cell("28일 페이지뷰", tot.views)}${cell("28일 신규", tot.newUsers)}</div>
      <div class="ad-card-h" style="font-size:12px;opacity:.7">📈 28일 방문자·세션</div>
      <div class="ad-chart">${AdminCharts.dualLine(days, {})}</div>`;
  }
  function relTime(iso) { try { const d = new Date(String(iso).replace(" ", "T")); const s = (Date.now() - d) / 1000; if (!isFinite(s)) return ""; if (s < 90) return "방금"; if (s < 5400) return Math.round(s / 60) + "분 전"; if (s < 129600) return Math.round(s / 3600) + "시간 전"; return Math.round(s / 86400) + "일 전"; } catch { return ""; } }

  let dashPresenceTimer = null;
  async function paintPresence() {
    const box = $("#ad-presence"); if (!box) return;
    const d = await rpc("admin_presence");
    if (!d?.ok) { box.innerHTML = `<div class="ad-soon">접속 현황을 불러오지 못했어요.</div>`; return; }
    const members = d.members || [], regions = d.regions || [];
    const regionChips = regions.length ? `<div class="ad-live-regions">${regions.map(r => `<span class="ad-region-chip">📍 ${esc(r.region)} <b>${fmt(r.c)}</b></span>`).join("")}</div>` : "";
    const memberList = members.length ? `<div class="ad-live-members">${members.map(m => `
      <div class="ad-live-mrow"><span class="dotlive"></span><b>${esc(m.nickname)}</b><span class="ad-live-region">📍 ${esc(m.region)}</span><span class="ad-live-ago">${ago(m.last_seen)}</span></div>`).join("")}</div>`
      : `<div class="ad-soon" style="padding:14px">지금 접속 중인 회원이 없어요.</div>`;
    box.innerHTML = `<div class="ad-live-stat">
        <div class="ad-live-i on"><div class="ad-live-v">${fmt(d.member_count)}</div><div class="ad-live-l">🟢 접속 회원</div></div>
        <div class="ad-live-i"><div class="ad-live-v">${fmt(d.guest_count)}</div><div class="ad-live-l">👤 비회원(게스트)</div></div>
        <div class="ad-live-i"><div class="ad-live-v">${fmt((d.member_count || 0) + (d.guest_count || 0))}</div><div class="ad-live-l">합계 접속</div></div>
      </div>${regionChips}${memberList}`;
  }

  // ─────────── 콘텐츠 관리 ───────────
  let cState = { type: "all", sort: "recent", q: "" };
  async function renderContent() {
    main().innerHTML = `<h1 class="ad-h1">📝 콘텐츠 관리</h1>
      <div class="ad-toolbar">
        <div class="ad-segs" id="c-type">${["all", "issue", "plaza", "market", "news"].map(k => `<button data-v="${k}" class="${cState.type === k ? "on" : ""}">${({ all: "전체", issue: "이슈", plaza: "광장", market: "예측", news: "뉴스" }[k])}</button>`).join("")}</div>
        <div class="ad-segs" id="c-sort">${["recent", "popular"].map(k => `<button data-v="${k}" class="${cState.sort === k ? "on" : ""}">${k === "recent" ? "최신" : "인기"}</button>`).join("")}</div>
        <input class="ad-search" id="c-q" placeholder="제목 검색…" value="${esc(cState.q)}">
      </div>
      <div class="ad-card" id="c-list"><div class="ad-loading">불러오는 중…</div></div>`;
    $("#c-type").onclick = e => { const b = e.target.closest("[data-v]"); if (!b) return; cState.type = b.dataset.v; renderContent(); };
    $("#c-sort").onclick = e => { const b = e.target.closest("[data-v]"); if (!b) return; cState.sort = b.dataset.v; renderContent(); };
    $("#c-q").onkeydown = e => { if (e.key === "Enter") { cState.q = e.target.value.trim(); renderContent(); } };
    const d = await rpc("admin_content", { p_type: cState.type, p_sort: cState.sort, p_q: cState.q || null, p_limit: 50 });
    const rows = d?.rows || [];
    const link = { issue: "issue.html?id=", plaza: "plaza_detail.html?id=", market: "predict-market.html?id=", news: "search.html" };
    $("#c-list").innerHTML = rows.length ? `<table class="ad-table"><thead><tr><th>제목</th><th>유형</th><th>작성자</th><th>👍</th><th>💬</th><th>❤️</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr>
        <td><a href="${link[r.type] + (r.type === 'news' ? '' : r.id)}" target="_blank" class="ad-clink">${esc(r.title || "(제목없음)")}</a></td>
        <td><span class="ad-tag t-${r.type}">${({ issue: "이슈", plaza: "광장", market: "예측", news: "뉴스" }[r.type])}</span></td>
        <td>${esc(r.author || "-")}</td><td>${fmt(r.votes)}</td><td>${fmt(r.comments)}</td><td>${fmt(r.likes)}</td>
        <td><button class="ad-btn danger" data-del="${r.type}:${r.id}">삭제</button></td></tr>`).join("")}
      </tbody></table>` : `<div class="ad-soon">콘텐츠가 없어요.</div>`;
    $("#c-list").onclick = async e => {
      const b = e.target.closest("[data-del]"); if (!b) return;
      const [type, id] = b.dataset.del.split(":");
      if (!confirm("이 콘텐츠를 삭제할까요? (되돌릴 수 없음)")) return;
      const r = await rpc("admin_delete_content", { p_type: type, p_id: id });
      if (r?.ok) { toast("삭제됨"); b.closest("tr").remove(); } else alert("삭제 실패");
    };
  }

  // ─────────── 신고·모더레이션 ───────────
  async function renderReports() {
    main().innerHTML = `<h1 class="ad-h1">🚨 신고·모더레이션</h1><div class="ad-card" id="r-list"><div class="ad-loading">불러오는 중…</div></div>`;
    const d = await rpc("admin_reports", { p_limit: 80 });
    const rows = d?.rows || [];
    $("#r-list").innerHTML = rows.length ? `<table class="ad-table"><thead><tr><th>대상</th><th>미리보기</th><th>사유</th><th>신고자</th><th>시각</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr><td><span class="ad-tag">${esc(r.content_type)}</span> #${esc(r.content_id)}</td>
        <td class="ad-prev">${esc(r.preview || "-")}</td><td>${esc(r.reason || "-")}</td><td>${esc(r.reporter || "-")}</td><td>${ago(r.created_at)}</td>
        <td><button class="ad-btn danger" data-act="delete:${r.id}">콘텐츠 삭제</button> <button class="ad-btn ghost" data-act="dismiss:${r.id}">기각</button></td></tr>`).join("")}
      </tbody></table>` : `<div class="ad-soon">처리할 신고가 없어요. 👍</div>`;
    $("#r-list").onclick = async e => {
      const b = e.target.closest("[data-act]"); if (!b) return;
      const [act, id] = b.dataset.act.split(":");
      const r = await rpc("admin_resolve_report", { p_id: Number(id), p_action: act });
      if (r?.ok) { toast(act === "delete" ? "삭제·처리됨" : "기각됨"); b.closest("tr").remove(); } else alert("처리 실패");
    };
  }

  // ─────────── 제보 관리 ───────────
  let tFilter = "pending";
  async function renderTips() {
    main().innerHTML = `<h1 class="ad-h1">🕵️ 제보 관리</h1>
      <div class="ad-segs" id="t-filter" style="margin-bottom:14px">${[["pending", "🕒 대기"], ["approved", "✅ 채택"], ["rejected", "✖ 반려"], ["all", "전체"]].map(([k, l]) => `<button data-v="${k}" class="${tFilter === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div id="t-list"><div class="ad-loading">불러오는 중…</div></div>`;
    $("#t-filter").onclick = e => { const b = e.target.closest("[data-v]"); if (!b) return; tFilter = b.dataset.v; renderTips(); };
    const d = await rpc("admin_tips", { p_status: tFilter, p_limit: 80 });
    const rows = d?.rows || [];
    $("#t-list").innerHTML = rows.length ? rows.map(t => {
      const media = Array.isArray(t.media) ? t.media : [];
      const links = Array.isArray(t.links) ? t.links : [];
      const st = { pending: "대기", approved: "채택", rejected: "반려" }[t.status] || t.status;
      return `<div class="ad-tip" data-id="${t.id}">
        <div class="ad-tip-h"><b>${esc(t.title)}</b> <span class="ad-tag st-${t.status === "approved" ? "done" : t.status === "rejected" ? "rejected" : "pending"}">${st}</span>
          <span class="ad-tk-m">${esc(t.nickname || "-")} · ${esc(t.category || "-")} · ${ago(t.created_at)} · 지급 ${fmt(t.reward_gp || 0)}GP</span></div>
        ${t.body ? `<div class="ad-tip-b">${esc(t.body)}</div>` : ""}
        ${media.length ? `<div class="ad-tip-media">${media.map(m => m.kind === "video"
          ? `<video src="${esc(m.url)}" muted playsinline controls></video>`
          : `<a href="${esc(m.url)}" target="_blank"><img src="${esc(m.url)}"></a>`).join("")}</div>` : ""}
        ${links.length ? `<div class="ad-tip-links">${links.map(l => `<a href="${esc(l)}" target="_blank" rel="noopener">🔗 ${esc(l)}</a>`).join("")}</div>` : ""}
        ${t.status === "pending" ? `<div class="ad-tip-acts">
          <button class="ad-btn primary" data-act="approve">✅ 채택 (+2,000GP)</button>
          <button class="ad-btn danger" data-act="reject">✖ 반려</button></div>`
          : t.admin_note ? `<div class="ad-tk-r">↳ ${esc(t.admin_note)}</div>` : ""}
      </div>`;
    }).join("") : `<div class="ad-soon">해당 상태의 제보가 없어요.</div>`;
    $("#t-list").onclick = async e => {
      const b = e.target.closest("[data-act]"); if (!b) return;
      const card = b.closest(".ad-tip"); const id = card.dataset.id; const act = b.dataset.act;
      if (act === "reject" && !confirm("이 제보를 반려할까요?")) return;
      const note = act === "approve" ? prompt("채택 메모(선택)") : prompt("반려 사유(선택)");
      const r = await rpc("admin_review_tip", { p_id: id, p_action: act, p_note: note || null });
      if (r?.ok) { toast(act === "approve" ? "채택 · +2,000GP 지급" : "반려 처리"); renderTips(); } else alert("처리 실패");
    };
  }

  // ─────────── 버그 신고 ───────────
  let bugFilter = "new";
  async function renderBugs() {
    main().innerHTML = `<h1 class="ad-h1">🐞 버그 신고</h1>
      <div class="ad-segs" id="bg-filter" style="margin-bottom:14px">${[["new", "🆕 새 신고"], ["reviewing", "🔧 확인중"], ["resolved", "✅ 해결"], ["wontfix", "🚫 보류"], ["", "전체"]].map(([k, l]) => `<button data-v="${k}" class="${bugFilter === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div id="bg-list"><div class="ad-loading">불러오는 중…</div></div>`;
    $("#bg-filter").onclick = e => { const b = e.target.closest("[data-v]"); if (!b) return; bugFilter = b.dataset.v; renderBugs(); };
    const d = await rpc("admin_bug_reports", { p_status: bugFilter || null, p_limit: 150 });
    const rows = d?.rows || [];
    const stmap = { new: "새 신고", reviewing: "확인중", resolved: "해결", wontfix: "보류" };
    $("#bg-list").innerHTML = rows.length ? rows.map(b => `<div class="ad-tip" data-id="${b.id}">
        <div class="ad-tip-h"><span class="ad-tag st-${b.status === "resolved" ? "done" : b.status === "new" ? "open" : "pending"}">${stmap[b.status] || b.status}</span>
          <span class="ad-tk-m">${esc(b.reporter || "익명")} · ${ago(b.created_at)} · ${esc(b.viewport || "")} · v${esc(b.app_version || "-")}</span></div>
        <div class="ad-tip-b" style="white-space:pre-wrap">${esc(b.message)}</div>
        <div class="ad-tk-m" style="margin-top:6px">📍 ${esc(b.page_url || "-")}</div>
        <div class="ad-tk-m" style="opacity:.6;font-size:11px">${esc(b.user_agent || "")}</div>
        ${b.admin_note ? `<div class="ad-tk-r">↳ ${esc(b.admin_note)}</div>` : ""}
        <div class="ad-tip-acts" style="margin-top:8px">
          <button class="ad-btn" data-act="reviewing">🔧 확인중</button>
          <button class="ad-btn primary" data-act="resolved">✅ 해결</button>
          <button class="ad-btn danger" data-act="wontfix">🚫 보류</button></div>
      </div>`).join("") : `<div class="ad-soon">해당 상태의 버그 신고가 없어요.</div>`;
    $("#bg-list").onclick = async e => {
      const btn = e.target.closest("[data-act]"); if (!btn) return;
      const id = Number(btn.closest(".ad-tip").dataset.id); const st = btn.dataset.act;
      const note = (st === "resolved" || st === "wontfix") ? prompt("메모(선택)") : null;
      const r = await rpc("admin_resolve_bug", { p_id: id, p_status: st, p_note: note || null });
      if (r?.ok) { toast("상태 변경: " + (stmap[st] || st)); renderBugs(); } else alert("처리 실패");
    };
  }

  // ─────────── 🤖 버그헌터 (자동 스캔 발견) ───────────
  const SEV = { critical: ["치명", "#ff4d67"], high: ["높음", "#ff9a3c"], medium: ["보통", "#6f86ff"], low: ["낮음", "#8a8f9a"] };
  const CATLBL = { security: "🔒 보안", economy: "💰 경제", stuck: "⛔ 멈춤", errors: "🩺 에러", data: "🗂 데이터" };
  let bhResolved = false;
  async function renderBugHunter() {
    main().innerHTML = `<h1 class="ad-h1">🤖 버그헌터 <span style="font-size:12px;color:#8a8f9a;font-weight:600">30분마다 자동 스캔</span></h1>
      <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center;flex-wrap:wrap">
        <button class="ad-btn primary" id="bh-run">🔍 지금 검사</button>
        <button class="ad-btn" id="bh-toggle">${bhResolved ? "미해결만 보기" : "해결된 것도 보기"}</button>
        <span id="bh-stat" class="ad-tk-m"></span>
      </div>
      <div id="bh-list"><div class="ad-loading">불러오는 중…</div></div>`;
    $("#bh-run").onclick = async () => {
      $("#bh-run").disabled = true; $("#bh-run").textContent = "검사 중…";
      const r = await rpc("admin_bug_hunt_run", {});
      toast(r?.ok ? `검사 완료 · 미해결 ${r.open}건` : "검사 실패");
      renderBugHunter();
    };
    $("#bh-toggle").onclick = () => { bhResolved = !bhResolved; renderBugHunter(); };
    const rows = (await rpc("admin_bug_hunt", { p_include_resolved: bhResolved })) || [];
    const open = rows.filter(r => !r.resolved).length;
    $("#bh-stat").textContent = `미해결 ${open}건`;
    $("#bh-list").innerHTML = rows.length ? rows.map(f => {
      const [sl, sc] = SEV[f.severity] || SEV.low;
      return `<div class="ad-tip" data-id="${f.id}" style="opacity:${f.resolved ? .5 : 1}">
        <div class="ad-tip-h">
          <span class="ad-tag" style="background:${sc}22;color:${sc};border:1px solid ${sc}55">${sl}</span>
          <span class="ad-tk-m">${CATLBL[f.category] || f.category} · ${f.hits}회 · 최근 ${ago(f.last_seen)}${f.resolved ? " · ✅해결" : ""}</span>
        </div>
        <div class="ad-tip-b" style="font-weight:800">${esc(f.title)}</div>
        <div class="ad-tk-m" style="white-space:pre-wrap;margin-top:4px">${esc(f.detail || "")}</div>
        ${f.resolved ? "" : `<div class="ad-tip-acts" style="margin-top:8px"><button class="ad-btn primary" data-act="resolve">✅ 해결 처리</button></div>`}
      </div>`;
    }).join("") : `<div class="ad-soon">🎉 발견된 문제가 없어요. 시스템 건강합니다.</div>`;
    $("#bh-list").onclick = async e => {
      const btn = e.target.closest("[data-act]"); if (!btn) return;
      const id = Number(btn.closest(".ad-tip").dataset.id);
      const r = await rpc("admin_bug_hunt_resolve", { p_id: id });
      if (r?.ok) { toast("해결 처리됨"); renderBugHunter(); } else alert("처리 실패");
    };
  }

  // ─────────── 🩺 에러 로그 (실사용자 JS 에러) ───────────
  let errHours = 48;
  async function renderErrors() {
    main().innerHTML = `<h1 class="ad-h1">🩺 에러 로그 <span style="font-size:12px;color:#8a8f9a;font-weight:600">실사용자 발생 JS 에러</span></h1>
      <div class="ad-segs" id="er-range" style="margin-bottom:14px">${[[6, "6시간"], [24, "24시간"], [48, "48시간"], [168, "7일"]].map(([h, l]) => `<button data-h="${h}" class="${errHours === h ? "on" : ""}">${l}</button>`).join("")}</div>
      <div id="er-list"><div class="ad-loading">불러오는 중…</div></div>`;
    $("#er-range").onclick = e => { const b = e.target.closest("[data-h]"); if (!b) return; errHours = +b.dataset.h; renderErrors(); };
    const rows = (await rpc("admin_client_errors", { p_hours: errHours, p_limit: 100 })) || [];
    $("#er-list").innerHTML = rows.length ? rows.map(e => `<div class="ad-tip">
        <div class="ad-tip-h"><span class="ad-tag st-open">${e.hits}회</span>
          <span class="ad-tk-m">${e.users}명 · 최근 ${ago(e.last_seen)} · v${esc(e.sample_ver || "-")} · ${esc(e.sample_path || "")}</span></div>
        <div class="ad-tip-b" style="white-space:pre-wrap;font-weight:700">${esc(e.message)}</div>
        ${e.sample_stack ? `<details style="margin-top:6px"><summary class="ad-tk-m" style="cursor:pointer">스택 보기</summary><pre style="white-space:pre-wrap;font-size:11px;color:#8a8f9a;margin-top:4px">${esc(e.sample_stack)}</pre></details>` : ""}
      </div>`).join("") : `<div class="ad-soon">해당 기간 수집된 에러가 없어요. 👍</div>`;
  }

  // ─────────── 회원 관리 ───────────
  let mFilter = "all", mQ = "";
  async function renderMembers() {
    main().innerHTML = `<h1 class="ad-h1">👥 회원 관리</h1>
      <div class="ad-toolbar">
        <div class="ad-segs" id="m-filter">${[["all", "전체"], ["top", "⭐ 우수"], ["watch", "⚠️ 요주의"], ["banned", "⛔ 블랙리스트"]].map(([k, l]) => `<button data-v="${k}" class="${mFilter === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <input class="ad-search" id="m-q" placeholder="닉네임 검색…" value="${esc(mQ)}"></div>
      <div class="ad-card" id="m-list"><div class="ad-loading">불러오는 중…</div></div>`;
    $("#m-filter").onclick = e => { const b = e.target.closest("[data-v]"); if (!b) return; mFilter = b.dataset.v; renderMembers(); };
    $("#m-q").onkeydown = e => { if (e.key === "Enter") { mQ = e.target.value.trim(); renderMembers(); } };
    const d = await rpc("admin_users", { p_filter: mFilter, p_q: mQ || null, p_limit: 300 });
    const rows = d?.rows || [];
    const gender = g => g === "male" ? "남" : g === "female" ? "여" : (g || "-");
    const cell = (v, cls = "") => `<td class="${cls}">${v}</td>`;
    $("#m-list").innerHTML = rows.length ? `
      <div class="ad-sheet-info">전체 ${fmt(rows.length)}명 · 가로 스크롤로 전체 컬럼 확인</div>
      <div class="ad-sheet-wrap"><table class="ad-sheet"><thead><tr>
        <th class="stick">닉네임</th><th>상태</th><th>이메일</th><th>전화</th><th>지역</th><th>성별</th><th>출생</th>
        <th>Lv</th><th>무료GP</th><th>충전GP</th><th>GC</th><th>누적GP</th><th>경고</th>
        <th>발의</th><th>댓글</th><th>투표</th><th>예측</th><th>보낸후원</th><th>받은수익</th>
        <th>가입일</th><th>최근접속</th><th class="stick-r">관리</th>
      </tr></thead><tbody>
      ${rows.map(r => `<tr>
        ${cell(`${esc(r.nickname || "익명")}${r.admin ? ' <span class="ad-tag t-admin">관리자</span>' : ''}`, "stick nick")}
        ${cell(r.banned ? '<span class="ad-tag t-ban">정지</span>' : '<span class="ok">정상</span>')}
        ${cell(esc(r.email || "-"), "mono")}
        ${cell(esc(r.phone || "-"), "mono")}
        ${cell(esc(r.region || "-"))}
        ${cell(gender(r.gender))}
        ${cell(r.birth_year || "-")}
        ${cell(r.level || 1, "num")}
        ${cell(fmt(r.gp_free), "num")}
        ${cell(r.gp_paid > 0 ? `<b class="paid">${fmt(r.gp_paid)}</b>` : "0", "num")}
        ${cell(r.gc > 0 ? `<b class="gc">${fmt(r.gc)}</b>` : "0", "num")}
        ${cell(fmt(r.lifetime), "num")}
        ${cell(r.warning > 0 ? `<span class="ad-warn">${r.warning}</span>` : "0", "num")}
        ${cell(fmt(r.issues), "num")}
        ${cell(fmt(r.comments), "num")}
        ${cell(fmt(r.votes), "num")}
        ${cell(fmt(r.bets), "num")}
        ${cell(r.don_sent > 0 ? "₩" + fmt(r.don_sent) : "-", "num")}
        ${cell(r.don_recv > 0 ? `<b class="won">₩${fmt(r.don_recv)}</b>` : "-", "num")}
        ${cell(r.created_at ? new Date(r.created_at).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" }) : "-", "mono")}
        ${cell(r.last_ping ? ago(r.last_ping) : "-", "mono")}
        ${cell(`<button class="ad-btn ghost" data-uid="${r.user_id}">관리</button>`, "stick-r")}
      </tr>`).join("")}
      </tbody></table></div>` : `<div class="ad-soon">해당 회원이 없어요.</div>`;
    $("#m-list").onclick = e => { const b = e.target.closest("[data-uid]"); if (b) openMember(b.dataset.uid); };
  }
  async function openMember(uid) {
    const d = await rpc("admin_user_detail", { p_user: uid });
    if (!d?.ok) { alert("조회 실패"); return; }
    const idRow = (l, v) => v ? `<div class="ad-idrow"><span>${l}</span><b>${esc(String(v))}</b></div>` : "";
    const w = modal(`<div class="ad-modal-h">👤 ${esc(d.nickname || "익명")}
        ${d.admin ? '<span class="ad-tag t-admin">관리자</span>' : ''} ${d.banned ? '<span class="ad-tag t-ban">정지</span>' : ''}
        <button class="ad-btn ghost" data-a="edit" style="margin-left:auto">✏️ 수정</button></div>

      <!-- 신원 (관리자 전용 열람) -->
      <div class="ad-idbox">
        ${idRow("이메일", d.email)}${idRow("전화", d.phone)}
        ${idRow("지역", d.region)}${idRow("성별", d.gender)}${idRow("출생", d.birth_year)}
        ${idRow("가입", d.created_at ? new Date(d.created_at).toLocaleDateString("ko-KR") : "")}
        ${idRow("최근 로그인", d.last_sign_in ? ago(d.last_sign_in) : "")}
        ${idRow("최근 접속", d.last_ping ? ago(d.last_ping) : "")}
        ${idRow("UID", uid)}
        ${d.bio ? idRow("소개", d.bio) : ""}
      </div>

      <div class="ad-mstat">${[
        ["발의", d.issues + (d.issues_anon > 0 ? ` <i>(익명${d.issues_anon})</i>` : "")],
        ["댓글", d.comments + (d.comments_anon > 0 ? ` <i>(익명${d.comments_anon})</i>` : "")],
        ["광장", (d.plaza_posts || 0) + (d.plaza_comments || 0)], ["투표", d.votes],
        ["예측", `${d.bets || 0}<i>(적중${d.bet_wins || 0})</i>`],
        ["무료GP", fmt(d.gp_free)], ["충전GP", fmt(d.gp_paid)], ["GC", fmt(d.gc)],
        ["보낸후원", "₩" + fmt(d.donations_sent)], ["받은수익", "₩" + fmt(d.donations_recv)],
        ["경고", d.warning], ["피신고", d.reports_against],
      ].map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>
      ${d.banned ? `<div class="ad-mrow ban">⛔ 정지 사유: ${esc(d.ban_reason || "-")}${d.ban_until ? ` (${new Date(d.ban_until).toLocaleDateString("ko-KR")}까지)` : " (무기한)"}</div>` : ""}

      <!-- 전 활동 내역 (익명 포함) -->
      <div class="ad-mtabs" id="mt-tabs">
        <button class="on" data-k="content">📜 활동</button>
        <button data-k="gp">🪙 GP</button>
        <button data-k="gc">💝 GC·후원</button>
        <button data-k="sanction">⚖️ 제재이력</button>
      </div>
      <div class="ad-mtl" id="mt-body"><div class="ad-loading">불러오는 중…</div></div>

      <div class="ad-mactions">
        <button class="ad-btn ghost" data-a="warn+">⚠️ 경고 +1</button>
        <button class="ad-btn ghost" data-a="warn-">경고 -1</button>
        <button class="ad-btn ghost" data-a="gp">💰 GP 지급</button>
        ${d.banned ? `<button class="ad-btn primary" data-a="unban">✅ 정지 해제</button>` : `<button class="ad-btn danger" data-a="ban">⛔ 정지</button>`}
        <button class="ad-btn ${d.admin ? "danger" : "primary"}" data-a="role">${d.admin ? "관리자 해제" : "관리자 지정"}</button>
        ${d.admin ? "" : `<button class="ad-btn danger" data-a="delete">🗑 회원 삭제</button>`}
      </div>`);

    // ── 타임라인 탭 로드 ──
    async function loadTl(kind) {
      const body = w.querySelector("#mt-body");
      body.innerHTML = `<div class="ad-loading">불러오는 중…</div>`;
      const t = await rpc("admin_user_timeline", { p_user: uid, p_kind: kind, p_limit: 60 });
      const rows = t?.rows || [];
      if (!rows.length) { body.innerHTML = `<div class="ad-soon">내역이 없어요.</div>`; return; }
      if (kind === "content") {
        body.innerHTML = rows.map(r => `<a class="ad-tl" href="${esc(r.link || "#")}" target="_blank">
          <span class="ad-tl-ic">${r.icon || "•"}</span>
          <span class="ad-tl-m"><span class="ad-tl-l">${esc(r.label)}${r.anon ? ' <span class="ad-tag t-anon">🕶 익명</span>' : ""}</span>
            <span class="ad-tl-t">${esc(r.text || "")}</span></span>
          <span class="ad-tl-ts">${ago(r.ts)}</span></a>`).join("");
      } else if (kind === "gp") {
        body.innerHTML = rows.map(r => `<div class="ad-tl">
          <span class="ad-tl-ic">${r.delta >= 0 ? "＋" : "－"}</span>
          <span class="ad-tl-m"><span class="ad-tl-l">${esc(r.reason)}</span></span>
          <span class="ad-tl-d ${r.delta >= 0 ? "up" : "down"}">${r.delta >= 0 ? "+" : ""}${fmt(r.delta)}</span>
          <span class="ad-tl-ts">${ago(r.ts)}</span></div>`).join("");
      } else if (kind === "gc") {
        const lbl = r => r.kind === "ledger" ? esc(r.reason)
          : r.kind === "donation_sent" ? `후원 보냄 → ${esc(r.to || "?")} ₩${fmt(r.amount)}`
          : r.kind === "donation_recv" ? `후원 받음 ← ${esc(r.from || "?")} ₩${fmt(r.amount)}`
          : `출금 ₩${fmt(r.amount)} (${esc(r.status)})`;
        body.innerHTML = rows.map(r => `<div class="ad-tl">
          <span class="ad-tl-ic">${r.kind === "withdrawal" ? "🏦" : r.kind === "ledger" ? "💝" : "💌"}</span>
          <span class="ad-tl-m"><span class="ad-tl-l">${lbl(r)}</span></span>
          ${r.delta != null ? `<span class="ad-tl-d ${r.delta >= 0 ? "up" : "down"}">${r.delta >= 0 ? "+" : ""}${fmt(r.delta)}</span>` : ""}
          <span class="ad-tl-ts">${ago(r.ts)}</span></div>`).join("");
      } else {
        body.innerHTML = rows.map(r => `<div class="ad-tl">
          <span class="ad-tl-ic">⚖️</span>
          <span class="ad-tl-m"><span class="ad-tl-l">${esc(r.action)} <small>by ${esc(r.by || "system")}</small></span>
            <span class="ad-tl-t">${esc(JSON.stringify(r.meta || {})).slice(0, 80)}</span></span>
          <span class="ad-tl-ts">${ago(r.ts)}</span></div>`).join("");
      }
    }
    w.querySelector("#mt-tabs").onclick = e => {
      const b = e.target.closest("[data-k]"); if (!b) return;
      w.querySelectorAll("#mt-tabs button").forEach(x => x.classList.toggle("on", x === b));
      loadTl(b.dataset.k);
    };
    loadTl("content");

    // ── ✏️ 회원 정보 수정 ──
    w.querySelector('[data-a="edit"]').onclick = async () => {
      const nick = prompt("닉네임 수정 (2~20자, 빈칸=유지)", d.nickname || "");
      if (nick === null) return;
      const bio = prompt("소개 수정 (빈칸=유지)", d.bio || "");
      if (bio === null && !nick) return;
      const r = await rpc("admin_update_user", {
        p_user: uid,
        p_nickname: nick && nick.trim() && nick.trim() !== d.nickname ? nick.trim() : null,
        p_bio: bio !== null && bio !== d.bio ? bio : null,
      });
      if (r?.ok) { toast("수정됐어요"); w.remove(); openMember(uid); }
      else alert("수정 실패: " + ({ dup_nickname: "이미 쓰는 닉네임이에요", bad_nickname: "닉네임은 2~20자" }[r?.reason] || r?.reason || ""));
    };
    w.querySelector(".ad-mactions").onclick = async e => {
      const b = e.target.closest("[data-a]"); if (!b) return; const a = b.dataset.a;
      if (a === "delete") {
        if (!confirm(`정말 '${d.nickname || "익명"}' 회원을 삭제할까요?\n이 회원의 계정·작성글·댓글이 모두 영구 삭제되며 되돌릴 수 없어요.`)) return;
        const r = await rpc("admin_delete_user", { p_user: uid });
        if (r?.ok) { toast("회원이 삭제됐어요"); w.remove(); renderMembers(); }
        else alert("삭제 실패: " + ({ self: "본인 계정은 삭제할 수 없어요", is_admin: "관리자는 삭제할 수 없어요", forbidden: "권한이 없어요" }[r?.reason] || r?.reason || "알 수 없는 오류"));
        return;
      }
      if (a === "warn+") await rpc("admin_adjust_warning", { p_user: uid, p_delta: 1 });
      else if (a === "warn-") await rpc("admin_adjust_warning", { p_user: uid, p_delta: -1 });
      else if (a === "gp") { const amt = parseInt(prompt("지급할 GP (음수=차감)", "1000") || "0"); if (amt) await rpc("admin_grant_gp", { p_user: uid, p_amount: amt, p_reason: "admin_grant" }); }
      else if (a === "ban") { const reason = prompt("정지 사유", "커뮤니티 규정 위반"); if (reason != null) await rpc("admin_set_ban", { p_user: uid, p_reason: reason, p_days: null }); }
      else if (a === "unban") await rpc("admin_unban", { p_user: uid });
      else if (a === "role") await rpc("admin_set_role", { p_user: uid, p_admin: !d.admin });
      toast("적용됨"); w.remove(); renderMembers();
    };
  }

  // ─────────── 정산·출금 ───────────
  async function renderSettle() {
    main().innerHTML = `<h1 class="ad-h1">💰 정산·출금</h1>
      <div class="ad-card" id="s-gc"><div class="ad-loading">갈라코인 회계 불러오는 중…</div></div>
      <div class="ad-card" id="s-list"><div class="ad-loading">불러오는 중…</div></div>`;
    // 🪙 갈라코인 회계 불변식 — 발행(충전) = 소비(후원) + 보유. drift는 항상 0이어야 한다.
    try {
      const { data: au } = await sb.from("gc_audit").select("*").maybeSingle();
      if (au) {
        const ok = Number(au.drift) === 0;
        const kpi = (l, v, c) => `<div class="ad-kpi"><div class="ad-kpi-l">${l}</div><div class="ad-kpi-v"${c ? ` style="color:${c}"` : ""}>${fmt(v)}</div></div>`;
        $("#s-gc").innerHTML = `<div class="ad-card-h">🪙 갈라코인(GC) 회계 — 발행 = 소비 + 보유</div>
          <div class="ad-kpis" style="grid-template-columns:repeat(4,1fr)">
            ${kpi("발행(충전)", au.issued)}${kpi("후원 소비", au.spent)}${kpi("유저 보유", au.held)}
            ${kpi("오차(0=정상)", au.drift, ok ? "#33d17a" : "#ff4d67")}
          </div>
          ${ok ? "" : `<div class="ad-soon" style="color:#ff4d67">⚠️ 회계 불변식 위반 — 즉시 원장 점검 필요</div>`}`;
      } else { $("#s-gc").innerHTML = `<div class="ad-card-h">🪙 갈라코인(GC) 회계</div><div class="ad-soon">데이터 없음</div>`; }
    } catch (_) { $("#s-gc").innerHTML = ""; }
    const d = await rpc("admin_withdrawals", { p_status: "all" });
    const rows = d?.rows || [];
    $("#s-list").innerHTML = rows.length ? `<div class="ad-card-h">대기 ${fmt(d.pending)}건</div><table class="ad-table"><thead><tr><th>닉네임</th><th>은행</th><th>계좌</th><th>예금주</th><th>금액</th><th>상태</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.nickname || "-")}</td><td>${esc(r.bank || "-")}</td><td>${esc(r.account || "-")}</td><td>${esc(r.holder || "-")}</td><td>₩${fmt(r.amount)}</td>
        <td><span class="ad-tag st-${r.status}">${({ pending: "대기", approved: "승인", done: "완료", rejected: "거절" }[r.status] || r.status)}</span></td>
        <td>${r.status === "pending" ? `<button class="ad-btn primary" data-w="approved:${r.id}">승인</button> <button class="ad-btn danger" data-w="rejected:${r.id}">거절</button>` : r.status === "approved" ? `<button class="ad-btn primary" data-w="done:${r.id}">완료처리</button>` : ""}</td></tr>`).join("")}
      </tbody></table>` : `<div class="ad-soon">출금 요청이 없어요.</div>`;
    $("#s-list").onclick = async e => { const b = e.target.closest("[data-w]"); if (!b) return; const [st, id] = b.dataset.w.split(":"); const r = await rpc("admin_process_withdrawal", { p_id: Number(id), p_status: st }); if (r?.ok) { toast("처리됨"); renderSettle(); } };
  }

  // ─────────── 고객지원 AS ───────────
  async function renderSupport() {
    main().innerHTML = `<h1 class="ad-h1">🎧 고객지원</h1><div class="ad-card" id="t-list"><div class="ad-loading">불러오는 중…</div></div>`;
    const d = await rpc("admin_tickets", { p_status: "all" });
    const rows = d?.rows || [];
    $("#t-list").innerHTML = rows.length ? `<div class="ad-card-h">미처리 ${fmt(d.open)}건</div>${rows.map(r => `
      <div class="ad-ticket"><div class="ad-tk-h"><b>${esc(r.subject)}</b> <span class="ad-tag st-${r.status}">${({ open: "신규", answered: "답변", closed: "종료" }[r.status])}</span> <span class="ad-tk-m">${esc(r.nickname || "-")} · ${ago(r.created_at)}</span></div>
        <div class="ad-tk-b">${esc(r.body)}</div>
        ${r.reply ? `<div class="ad-tk-r">↳ ${esc(r.reply)}</div>` : `<button class="ad-btn primary" data-reply="${r.id}">답변하기</button>`}</div>`).join("")}` : `<div class="ad-soon">문의가 없어요.</div>`;
    $("#t-list").onclick = async e => { const b = e.target.closest("[data-reply]"); if (!b) return; const rep = prompt("답변 내용"); if (!rep) return; const r = await rpc("admin_reply_ticket", { p_id: Number(b.dataset.reply), p_reply: rep }); if (r?.ok) { toast("답변 전송"); renderSupport(); } };
  }

  // ─────────── 직접 업로드 (유형별 맞춤 업로더) ───────────
  let upTab = "issue";
  const IN = (id, label, ph, val) => `<label>${label}</label><input id="${id}" class="ad-input" placeholder="${ph || ""}" value="${val || ""}">`;
  const TA = (id, label, ph, rows) => `<label>${label}</label><textarea id="${id}" class="ad-input" rows="${rows || 4}" placeholder="${ph || ""}"></textarea>`;
  function renderUpload() {
    const tabs = [["issue", "📝 이슈"], ["short", "📱 숏판"], ["long", "🖥 롱판"], ["plaza", "💬 광장"], ["market", "📈 예측"], ["news", "📰 뉴스"]];
    main().innerHTML = `<h1 class="ad-h1">⬆️ 직접 업로드</h1>
      <div class="ad-segs" id="u-tab" style="margin-bottom:14px">${tabs.map(([k, l]) => `<button data-v="${k}" class="${upTab === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div class="ad-card ad-form" id="u-form"></div>`;
    $("#u-tab").onclick = e => { const b = e.target.closest("[data-v]"); if (!b) return; upTab = b.dataset.v; renderUpload(); };
    ({ issue: upIssue, short: () => upGallari("vertical"), long: () => upGallari("horizontal"), plaza: upPlaza, market: upMarket, news: upNews }[upTab])();
  }
  let issueLinks = [];
  function renderIssueLinks() {
    const box = $("#i-links"); if (!box) return;
    box.innerHTML = issueLinks.length ? issueLinks.map((l, i) => `
      <div class="ad-link-card">
        ${l.image ? `<span class="ad-link-thumb" style="background-image:url('${esc(l.image)}')"></span>` : `<span class="ad-link-thumb none">🔗</span>`}
        <span class="ad-link-mid"><span class="ad-link-src">${esc(l.source || "")}</span><span class="ad-link-title">${esc(l.title || l.url)}</span></span>
        <button class="ad-link-x" data-rm="${i}" title="삭제">✕</button>
      </div>`).join("") : `<div class="ad-note" style="margin:0">붙인 뉴스 링크가 여기에 관련 뉴스 카드로 쌓입니다.</div>`;
    box.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { issueLinks.splice(+b.dataset.rm, 1); renderIssueLinks(); });
  }
  // 붙여넣기 원문 → 제목/한줄평/핵심요약/진영 자동 파싱 (사용자 양식 대응)
  function parseIssueText(raw) {
    const lines = String(raw || "").replace(/\r/g, "").split("\n").map(s => s.trim());
    // sum = '핵심요약:'으로 이름표가 붙은 줄 / free = 이름표 없는 줄. 이 둘을 반드시 구분해야 한다.
    // 예전엔 한 배열에 섞고 "제목이 없으면 첫 줄을 제목으로" 했는데, '제목:' 줄이 없는 원문에서는
    // 핵심요약 문단이 통째로 제목으로 끌려갔다(제목은 문단 하나, 본문엔 👍 줄만 남음).
    let title = "", one = ""; const sum = [], free = [], facs = [], tags = [];
    // #해시태그는 삭제하지 말고 추출한다(원문 어디에 있든 전부)
    (String(raw || "").match(/#[^\s#,.!?()\[\]{}"']+/g) || []).forEach(h => {
      const t = h.replace(/^#/, "").trim(); if (t && !tags.includes(t) && tags.length < 10) tags.push(t);
    });
    for (const ln of lines) {
      if (!ln) continue;
      if (/^#/.test(ln) || /^(#[^\s#]+\s*)+$/.test(ln)) continue;               // 해시태그 전용 줄은 본문에서 제외(태그는 위에서 이미 추출)
      let m;
      if ((m = ln.match(/^제목\s*[:：]\s*(.+)$/))) { if (!title) title = m[1].trim(); continue; }
      if ((m = ln.match(/^(?:한\s*줄\s*평|한\s*줄\s*요약)\s*[:：]\s*(.+)$/))) { if (!one) one = m[1].trim(); continue; }
      if ((m = ln.match(/^(?:핵심\s*요약|요약)\s*[:：]?\s*(.*)$/))) { if (m[1]) sum.push(m[1].trim()); continue; }
      if (/^[👍👎]/u.test(ln)) { facs.push(ln); continue; }                       // 진영 줄 (u플래그 필수)
      free.push(ln);
    }
    // 제목은 '제목:' 줄, 없으면 이름표 없는 첫 줄. 이름표가 붙은 요약은 절대 제목이 되지 않는다.
    if (!title && free.length) title = free.shift();
    const body = sum.concat(free);
    const label = s => s.replace(/^[👍👎]\s*/u, "").split(/\s+[-–—]\s+/)[0].trim(); // ' - ' 앞 라벨만(한 줄)
    // 👍 줄은 진영 이름(라벨)만 뽑고 버렸었다 → 정작 그 줄의 설명("- " 뒤)이 통째로 사라졌다.
    // 이제 라벨은 진영으로 쓰고, 줄 자체는 핵심 요약 끝에 붙인다(원문 그대로, 서로 붙여 목록처럼).
    // #issue-explain-text 는 white-space:pre-wrap 이라 줄바꿈이 그대로 살아난다.
    const parts = [];
    if (body.length) parts.push(body.join("\n\n").trim());
    if (facs.length) parts.push(facs.join("\n"));
    return {
      title: (title || "").trim(),
      one: one,
      desc: parts.join("\n\n").trim(),
      fa: facs[0] ? label(facs[0]) : "",
      fb: facs[1] ? label(facs[1]) : "",
      tags: tags,
    };
  }

  // 해시태그 수집 — 입력칸("#a #b" or "a b") + 제목·본문에서 추출, 최대 10개 (관리자 자체 구현)
  function adCollectTags(inputVal, ...texts) {
    const out = [];
    const add = x => { x = String(x || "").replace(/^#/, "").trim(); if (x && !out.includes(x) && out.length < 10) out.push(x); };
    String(inputVal || "").split(/[\s,#]+/).forEach(add);
    texts.forEach(t => (String(t || "").match(/#[^\s#,.!?()\[\]{}"']+/g) || []).forEach(add));
    return out;
  }

  const CATS = ["정치·사회", "경제·투자", "직장·경력", "연애·결혼", "생활·일상", "패션·뷰티", "엔터·스포츠", "세계·여행", "음식·맛집", "19금", "기타"];
  const DONS = ["사회복지", "아동·청소년 지원", "장애인 지원", "환경 보호", "재난·긴급구호", "교육 및 문화", "동물 보호", "헌혈·재능기부"];
  const optList = (arr, sel) => arr.map(o => `<option${o === sel ? " selected" : ""}>${o}</option>`).join("");

  function upIssue() {
    issueLinks = [];
    $("#u-form").innerHTML = `
      <label>📋 원문 붙여넣기 <span style="opacity:.6;font-weight:400">— 제목·요약·진영이 자동으로 채워집니다</span></label>
      <textarea id="i-paste" class="ad-input" rows="7" placeholder="제목·한줄평·핵심요약·👍 진영 두 줄·#해시태그가 포함된 원문을 그대로 붙여넣으세요."></textarea>
      <button class="ad-btn ghost" id="i-parse" type="button" style="margin-bottom:14px">⚡ 자동 채움</button>
      <hr class="ad-hr">
      ${IN("i-title", "제목 *", "자동 채움됩니다")}
      ${IN("i-one", "한줄 요약 *", "제목 아래·피드 카드에 보이는 한 줄 (= 한줄평)")}
      ${TA("i-desc", "핵심요약(본문)", "자동 채움됩니다 — 👍 진영 두 줄까지 포함됩니다", 8)}
      <div class="ad-2col">${IN("i-fa", "진영 A (찬성)", "👍 찬성이오")}${IN("i-fb", "진영 B (반대)", "👎 난 반댈세")}</div>
      <label>작성자 입장 *</label>
      <div class="ad-stance" id="i-stance">
        <button type="button" class="on" data-st="pro"><span>👍</span> <b id="i-st-a">찬성이오</b></button>
        <button type="button" data-st="con"><span>👎</span> <b id="i-st-b">난 반댈세</b></button>
      </div>
      <div class="ad-2col">
        <div><label>카테고리 *</label><select id="i-cat" class="ad-input"><option value="">선택</option>${optList(CATS)}</select></div>
        <div><label>기부처 *</label><select id="i-don" class="ad-input"><option value="">선택</option>${optList(DONS)}</select></div>
      </div>
      ${IN("i-tags", "🔖 해시태그", "#정치 #선거 — 공백으로 구분, 자동 채움됩니다 (최대 10개)")}
      <hr class="ad-hr">
      <label>🖼 미디어 — 사진·영상 캐러셀 <span style="opacity:.6;font-weight:400">(여러 개 = 캐러셀 · 첫 항목이 표지)</span></label>
      <input id="i-media" type="file" accept="image/*,video/*" multiple class="ad-file">
      <div id="i-media-strip" class="ad-mstrip"></div>
      <details class="ad-more"><summary>관련 링크 · 근거 (선택)</summary>
        <div class="ad-link-add"><input id="i-link-url" class="ad-input" placeholder="URL 붙여넣기 → 추가" style="margin:0">
        <button class="ad-btn ghost" id="i-link-go" type="button">추가</button></div>
        <div id="i-links" class="ad-links"></div>
      </details>
      <button class="ad-btn primary" id="i-go">🚀 이슈 발행</button>
      <div class="ad-note">사진·영상을 한 입력에서 섞어 캐러셀로 — 고르면 바로 업로드, 첫 항목이 표지. 진영명 비우면 기본(찬성이오/난 반댈세).</div>`;
    renderIssueLinks();

    // 작성자 입장 토글 + 진영 라벨 동기화
    let stance = "pro";
    const syncStance = () => {
      $("#i-st-a").textContent = $("#i-fa").value.trim() || "찬성이오";
      $("#i-st-b").textContent = $("#i-fb").value.trim() || "난 반댈세";
    };
    $("#i-stance").onclick = e => { const b = e.target.closest("[data-st]"); if (!b) return; stance = b.dataset.st; $("#i-stance").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); };
    $("#i-fa").oninput = syncStance; $("#i-fb").oninput = syncStance;

    $("#i-parse").onclick = () => {
      const p = parseIssueText($("#i-paste").value);
      if (p.title) $("#i-title").value = p.title;
      if (p.one) $("#i-one").value = p.one;
      if (p.desc) $("#i-desc").value = p.desc;
      if (p.fa) $("#i-fa").value = p.fa;
      if (p.fb) $("#i-fb").value = p.fb;
      if (p.tags && p.tags.length && $("#i-tags")) $("#i-tags").value = p.tags.map(t => "#" + t).join(" ");
      syncStance();
      toast("자동 채움 완료 — 확인 후 발행하세요");
    };
    // 🎠 이슈 혼합 캐러셀 — 사진·영상 하나의 입력으로(순서 보존, 첫 항목 표지). admin은 crop 없이 원본 업로드.
    let iMedia = [];   // [{kind:'image'|'video', file, url, thumb, up}]
    const iStrip = $("#i-media-strip"), iInput = $("#i-media");
    const renderIMedia = () => {
      iStrip.innerHTML = iMedia.map((it, i) => `
        <div class="ad-mitem${it.up ? " up" : ""}" data-i="${i}">
          ${it.kind === "video" ? (it.thumb ? `<img src="${it.thumb}">` : `<div class="ad-mvph">🎬</div>`) + `<span class="ad-mplay">▶</span>` : `<img src="${it.url || (it.file ? URL.createObjectURL(it.file) : "")}">`}
          ${it.up ? '<span class="ad-mup"></span>' : ""}
          ${i === 0 ? '<span class="ad-mbadge">표지</span>' : ""}
          <button type="button" class="ad-mdel" data-i="${i}">✕</button>
        </div>`).join("") + (iMedia.length ? `<div class="ad-mnote">${iMedia.length}개 · 첫 항목이 표지${iMedia.length > 1 ? " · 캐러셀" : ""}</div>` : "");
    };
    const upIImg = async (it) => { if (!it.file || it.url) return; it.up = true; try { it.url = await window.GALLA_UPLOAD_MEDIA(it.file, "image"); } catch (e) {} finally { it.up = false; renderIMedia(); } };
    const upIVid = async (it) => { if (!it.file || it.url) return; it.up = true; renderIMedia(); try { const out = await window.GALLA_UPLOAD_VIDEO(it.file); it.url = out.url || out.hls; it.thumb = it.thumb || out.thumbnail || null; } catch (e) {} finally { it.up = false; renderIMedia(); } };
    iInput.onchange = () => {
      const files = [...(iInput.files || [])];
      const added = files.map(f => /^video\//.test(f.type) ? { kind: "video", file: f, url: null, thumb: null, up: true } : { kind: "image", file: f, url: null, thumb: null, up: true });
      iMedia = iMedia.concat(added).slice(0, 10);
      renderIMedia();
      added.forEach(it => it.kind === "video" ? upIVid(it) : upIImg(it));
      iInput.value = "";
    };
    iStrip.onclick = e => { const d = e.target.closest(".ad-mdel"); if (d) { iMedia.splice(Number(d.dataset.i), 1); renderIMedia(); } };

    const addLink = async () => {
      const u = $("#i-link-url").value.trim(); if (!/^https?:\/\//i.test(u)) return alert("http(s):// 로 시작하는 URL을 입력하세요.");
      const btn = $("#i-link-go"); btn.disabled = true; btn.textContent = "불러오는 중…";
      const { data } = await sb.functions.invoke("link-preview", { body: { url: u } });
      issueLinks.push({ url: data?.url || u, title: data?.title || u, source: data?.source || "", image: data?.image || null });
      $("#i-link-url").value = ""; btn.disabled = false; btn.textContent = "추가"; renderIssueLinks();
    };
    $("#i-link-go").onclick = addLink;
    $("#i-link-url").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); addLink(); } };

    $("#i-go").onclick = async () => {
      const t = $("#i-title").value.trim(); if (!t) { toast("제목이 비었어요. ⚡자동 채움을 먼저 눌러주세요."); return $("#i-title").focus(); }
      // 한줄 요약(= 한줄평, issues.one_line)은 제목 아래(#issue-desc)와 피드 카드에 그대로 노출된다.
      // 비면 그 자리가 빈칸이 된다 — 예전엔 폼에 칸조차 없어 p_one_line에 항상 null이 가서
      // 관리자 이슈는 전부 빈칸이었다. 사용자 write.html의 '한줄 요약(필수)'과 같은 필드다.
      const one = $("#i-one").value.trim(); if (!one) { toast("한줄 요약이 비었어요 — 제목 아래와 피드 카드에 보이는 줄입니다."); return $("#i-one").focus(); }
      if (!$("#i-cat").value) return toast("카테고리를 선택하세요.");
      if (!$("#i-don").value) return toast("기부처를 선택하세요.");
      const btn = $("#i-go"); btn.disabled = true;
      try {
        const set = m => btn.textContent = m;
        // 🎠 혼합 캐러셀 — iMedia(사진·영상 순서)를 순서대로 업로드 → media[] + 하위호환.
        const media = [], images = [];
        let video_url = null;
        for (let i = 0; i < iMedia.length; i++) {
          const it = iMedia[i];
          if (!it.url && it.file) {
            set(`⬆️ 미디어 ${i + 1}/${iMedia.length}…`);
            if (it.kind === "video") { const out = await window.GALLA_UPLOAD_VIDEO(it.file, p => set(p == null ? "🎬 영상 업로드…" : `🎬 영상 ${p}%`)); it.url = out.url || out.hls; it.thumb = it.thumb || out.thumbnail || null; }
            else { it.url = await window.GALLA_UPLOAD_MEDIA(it.file, "image"); }
          }
          if (!it.url) continue;
          media.push({ type: it.kind, url: it.url, thumb: it.thumb || null });
          if (it.kind === "image") images.push(it.url); else if (!video_url) video_url = it.url;
        }
        const first = media[0];
        const thumb = first ? (first.type === "video" ? first.thumb : first.url) : null;
        const card_thumb = thumb;   // 마이페이지 카드 표지 = 첫 항목
        // 🔖 해시태그 — 입력칸 + 제목·본문에서 추출
        const tags = adCollectTags($("#i-tags") ? $("#i-tags").value : "", t, $("#i-desc").value);
        set("🚀 발행 중…");
        const r = await rpc("admin_publish_issue", {
          p_title: t, p_desc: $("#i-desc").value.trim(), p_category: $("#i-cat").value,
          p_one_line: one, p_faction_a: $("#i-fa").value.trim(), p_faction_b: $("#i-fb").value.trim(),
          p_thumb: thumb, p_links: issueLinks, p_video: video_url, p_images: images,
          p_card_thumb: card_thumb, p_donation: $("#i-don").value, p_stance: stance,
          p_media: media.length ? media : null, p_tags: tags.length ? tags : null,
        });
        if (r?.ok) { toast("이슈 발행됨"); location.href = "issue.html?id=" + r.id; }
        else { alert("발행 실패: " + (r?.reason || "알 수 없음")); btn.disabled = false; btn.textContent = "🚀 이슈 발행"; }
      } catch (e) { console.error(e); alert("업로드/발행 중 오류: " + (e?.message || e)); btn.disabled = false; btn.textContent = "🚀 이슈 발행"; }
    };
  }

  // 📱 숏판(세로 릴스: 사진 캐러셀/세로영상) · 🖥 롱판(가로 유튜브식: 가로영상+제목)
  function upGallari(fixedKind) {
    const isH = fixedKind === "horizontal";
    $("#u-form").innerHTML = `
      <div id="g-title-block" ${isH ? "" : "hidden"}>${IN("g-title", "제목 * (롱판)", "가로 영상 제목")}</div>
      ${TA("g-caption", "내용 / 설명", "숏판=내용, 롱판=설명", 4)}
      ${IN("g-tags", "🔖 해시태그", "#여행 #맛집 — 공백으로 구분 (최대 10개)")}
      <hr class="ad-hr">
      <div id="g-vertical-media">
        <div class="ad-3col">
          <div><label>🖼 사진(여러 장·캐러셀)</label><input id="g-photos" type="file" accept="image/*" multiple class="ad-file"><div class="ad-file-n" id="g-photos-n"></div></div>
          <div><label>📹 세로 영상</label><input id="g-vvideo" type="file" accept="video/*" class="ad-file"><div class="ad-file-n" id="g-vvideo-n"></div></div>
          <div><label>📇 표지(선택)</label><input id="g-vthumb" type="file" accept="image/*" class="ad-file"><div class="ad-file-n" id="g-vthumb-n"></div></div>
        </div>
        <div class="ad-note" style="margin-top:8px">숏판: 사진 여러 장(캐러셀) 또는 세로 영상 하나. 사진이 있으면 사진 캐러셀로 나갑니다.</div>
      </div>
      <div id="g-horizontal-media" ${isH ? "" : "hidden"}>
        <div class="ad-2col">
          <div><label>🎬 가로 영상 *</label><input id="g-hvideo" type="file" accept="video/*" class="ad-file"><div class="ad-file-n" id="g-hvideo-n"></div></div>
          <div><label>📇 표지 썸네일(선택)</label><input id="g-hthumb" type="file" accept="image/*" class="ad-file"><div class="ad-file-n" id="g-hthumb-n"></div></div>
        </div>
      </div>
      <button class="ad-btn primary" id="g-go" style="margin-top:14px">🚀 ${isH ? "롱판" : "숏판"} 발행</button>
      <div class="ad-note">${isH ? "롱판 — 가로 플레이어 노출" : "숏판 — 릴스 탭 노출"}. 관리자 발행은 자동 승인됩니다.</div>`;

    const gkind = isH ? "horizontal" : "vertical";
    const goLabel = "🚀 " + (isH ? "롱판" : "숏판") + " 발행";
    $("#g-vertical-media").hidden = isH;
    if ($("#g-caption")) $("#g-caption").previousElementSibling.textContent = isH ? "설명" : "내용";
    const fn = (inp, out) => { const el = $(inp); if (el) el.onchange = () => { const fs = el.files; $(out).textContent = fs.length ? (fs.length > 1 ? `${fs.length}개 선택됨` : fs[0].name) : ""; }; };
    ["g-photos", "g-vvideo", "g-vthumb", "g-hvideo", "g-hthumb"].forEach(id => fn("#" + id, "#" + id + "-n"));

    $("#g-go").onclick = async () => {
      const title = ($("#g-title") ? $("#g-title").value : "").trim();
      const caption = ($("#g-caption") ? $("#g-caption").value : "").trim();
      if (gkind === "horizontal" && !title) return toast("롱판은 제목이 필요해요.");
      const btn = $("#g-go"); btn.disabled = true;
      const set = m => btn.textContent = m;
      try {
        let images = null, video_url = null, thumbnail_url = null, media = null;
        if (gkind === "vertical") {
          // 🎠 숏판 혼합 캐러셀 — 사진들(순서) + 세로영상. 첫 항목이 표지.
          media = []; const imgUrls = [];
          const photos = [...($("#g-photos").files || [])];
          for (let i = 0; i < photos.length; i++) { set(`🖼 사진 ${i + 1}/${photos.length}…`); const u = await window.GALLA_UPLOAD_MEDIA(photos[i], "image"); imgUrls.push(u); media.push({ type: "image", url: u, thumb: null }); }
          const vf = $("#g-vvideo").files[0];
          if (vf) { set("📹 영상 업로드…"); const out = await window.GALLA_UPLOAD_VIDEO(vf, p => set(p == null ? "📹 영상 업로드…" : `📹 영상 ${p}%`)); video_url = out.url || out.hls; media.push({ type: "video", url: video_url, thumb: out.thumbnail || null }); }
          if (!media.length) { toast("사진 또는 세로 영상을 올려주세요."); btn.disabled = false; btn.textContent = goLabel; return; }
          images = imgUrls.length ? imgUrls : null;
          const first = media[0];
          thumbnail_url = first.type === "video" ? first.thumb : first.url;
          const tf = $("#g-vthumb").files[0];
          if (tf) { set("📇 표지 업로드…"); thumbnail_url = await window.GALLA_UPLOAD_MEDIA(tf, "image"); }
        } else {
          const vf = $("#g-hvideo").files[0];
          if (!vf) { toast("가로 영상을 올려주세요."); btn.disabled = false; btn.textContent = goLabel; return; }
          set("🎬 영상 업로드…"); const out = await window.GALLA_UPLOAD_VIDEO(vf, p => set(p == null ? "🎬 영상 업로드…" : `🎬 영상 ${p}%`));
          video_url = out.url || out.hls; thumbnail_url = out.thumbnail || null;
          const tf = $("#g-hthumb").files[0];
          if (tf) { set("📇 표지 업로드…"); thumbnail_url = await window.GALLA_UPLOAD_MEDIA(tf, "image"); }
        }
        const tags = adCollectTags($("#g-tags") ? $("#g-tags").value : "", title, caption);
        set("🚀 발행 중…");
        const r = await rpc("admin_publish_post", {
          p_kind: gkind, p_title: title || null, p_caption: caption || null,
          p_images: images, p_video: video_url, p_thumbnail: thumbnail_url,
          p_tags: tags.length ? tags : null, p_media: (media && media.length) ? media : null,
        });
        if (r?.ok) { toast((isH ? "롱판" : "숏판") + " 발행됨"); location.href = "gallari-post.html?id=" + r.id; }
        else { alert("발행 실패: " + (r?.reason || "알 수 없음")); btn.disabled = false; btn.textContent = goLabel; }
      } catch (e) { console.error(e); alert("업로드/발행 중 오류: " + (e?.message || e)); btn.disabled = false; btn.textContent = goLabel; }
    };
  }

  function upPlaza() {
    $("#u-form").innerHTML =
      IN("p-title", "제목 *", "광장 글 제목") + TA("p-body", "본문 *", "자유롭게 작성", 7) +
      IN("p-cat", "카테고리", "", "자유") + IN("p-cover", "커버 이미지 URL", "https://…") +
      `<button class="ad-btn primary" id="p-go">🚀 광장 글 발행</button>`;
    $("#p-go").onclick = async () => {
      const t = $("#p-title").value.trim(), b = $("#p-body").value.trim(); if (!t || !b) return alert("제목·본문 필수");
      const r = await rpc("admin_publish_plaza", { p_title: t, p_body: b, p_category: $("#p-cat").value.trim() || "자유", p_cover: $("#p-cover").value.trim() });
      if (r?.ok) { toast("광장 글 발행됨"); location.href = "plaza_detail.html?id=" + r.id; } else alert("발행 실패");
    };
  }
  function upMarket() {
    $("#u-form").innerHTML =
      IN("m-q", "질문 *", "예: 다음 대선 승자는?") + TA("m-desc", "설명", "정산 기준 등", 3) +
      IN("m-cat", "카테고리", "", "정치") +
      `<label>마감일 *</label><input id="m-close" class="ad-input" type="datetime-local">` +
      `<label>유형</label><div class="ad-segs" id="m-type"><button data-v="binary" class="on">예/아니오</button><button data-v="multi">객관식</button></div>` +
      `<div id="m-outcomes" hidden>${TA("m-opts", "선택지 (줄바꿈으로 구분)", "후보1\n후보2\n후보3", 4)}</div>` +
      IN("m-img", "대표 이미지 URL", "https://…") +
      `<button class="ad-btn primary" id="m-go">🚀 예측 마켓 생성</button>`;
    let mType = "binary";
    $("#m-type").onclick = e => { const b = e.target.closest("[data-v]"); if (!b) return; mType = b.dataset.v; $("#m-type").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); $("#m-outcomes").hidden = mType !== "multi"; };
    $("#m-go").onclick = async () => {
      const q = $("#m-q").value.trim(); if (!q) return $("#m-q").focus();
      const close = $("#m-close").value; if (!close) return alert("마감일 필수");
      let outcomes = null;
      if (mType === "multi") { const opts = $("#m-opts").value.split("\n").map(s => s.trim()).filter(Boolean); if (opts.length < 2) return alert("객관식은 선택지 2개 이상"); outcomes = opts.map(l => ({ label: l })); }
      const { data, error } = await sb.rpc("create_market", { p_question: q, p_description: $("#m-desc").value.trim(), p_category: $("#m-cat").value.trim() || "정치", p_image_url: $("#m-img").value.trim() || null, p_close_at: new Date(close).toISOString(), p_outcomes: outcomes });
      if (error) return alert("생성 실패: " + error.message);
      toast("마켓 생성됨"); location.href = "predict-market.html?id=" + data;
    };
  }
  function upNews() {
    $("#u-form").innerHTML =
      IN("n-title", "제목 *", "뉴스 제목") + TA("n-sum", "요약", "한두 문장 요약", 2) +
      TA("n-body", "본문 *", "기사 본문", 8) + IN("n-cat", "카테고리", "", "사회") + IN("n-hero", "대표 이미지 URL", "https://…") +
      `<button class="ad-btn primary" id="n-go">🚀 갈라뉴스 게시</button><div class="ad-note">AI 자동 생성이 필요하면 운영 탭의 크론/엣지 함수를 사용하세요.</div>`;
    $("#n-go").onclick = async () => {
      const t = $("#n-title").value.trim(), b = $("#n-body").value.trim(); if (!t || !b) return alert("제목·본문 필수");
      const r = await rpc("admin_publish_news", { p_title: t, p_summary: $("#n-sum").value.trim(), p_body: b, p_category: $("#n-cat").value.trim() || "사회", p_hero: $("#n-hero").value.trim() });
      if (r?.ok) { toast("뉴스 게시됨"); } else alert("게시 실패");
    };
  }

  // ─────────── 🧠 브레인 엔진 (크리에이터 패턴) ───────────
  let brainKind = "title";
  const BRAIN_KINDS = [["title", "🔥 제목"], ["thumbnail", "🖼 썸네일"], ["hook", "🎣 훅"], ["script", "📜 대본"]];
  const BRAIN_CT = ["general", "issue", "plaza", "gallari", "predict"];
  async function renderBrain() {
    const inp = "width:100%;box-sizing:border-box;padding:8px 10px;background:#0d1420;border:1px solid #26364c;border-radius:8px;color:#e6f0fb;font-size:13px;font-family:inherit";
    main().innerHTML = `<h1 class="ad-h1">🧠 브레인 엔진 <span style="font-size:13px;color:#7d8ba0;font-weight:600">— 성공 유형 패턴(AI에 주입돼 제목·썸네일·대본 생성). 계속 쌓을수록 똑똑해집니다.</span></h1>
      <div id="b-stats" style="margin-bottom:16px"></div>
      <div style="background:#111a28;border:1px solid #223047;border-radius:14px;padding:14px;margin-bottom:16px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:9px">
          <label style="font-size:11px;color:#8fa0b5">종류<select id="bf-kind" style="${inp}">${BRAIN_KINDS.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
          <label style="font-size:11px;color:#8fa0b5">콘텐츠 타입<select id="bf-ct" style="${inp}">${BRAIN_CT.map(c => `<option value="${c}">${c}</option>`).join("")}</select></label>
          <label style="font-size:11px;color:#8fa0b5">스타일(유형 이름)<input id="bf-style" style="${inp}" placeholder="예: 손실회피 / 신사임당형"></label>
          <label style="font-size:11px;color:#8fa0b5">유형 설명<input id="bf-sd" style="${inp}" placeholder="한 줄 설명"></label>
        </div>
        <label style="font-size:11px;color:#8fa0b5">공식(필수) — 패턴/템플릿<textarea id="bf-formula" rows="2" style="${inp};resize:vertical" placeholder="예: '이거 모르면 ~한다' — 손실·후회 프레임 + 명령형"></textarea></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:9px">
          <label style="font-size:11px;color:#8fa0b5">예시(| 로 구분)<input id="bf-ex" style="${inp}" placeholder="예1|예2|예3"></label>
          <label style="font-size:11px;color:#8fa0b5">가이드(주의/언제)<input id="bf-guide" style="${inp}" placeholder="언제 쓰는지·주의점"></label>
        </div>
        <div style="display:flex;align-items:center;gap:14px;margin-top:11px">
          <label style="font-size:12px;color:#c3ccda">중요도 <input id="bf-weight" type="number" min="1" max="5" value="3" style="width:56px;padding:6px;background:#0d1420;border:1px solid #26364c;border-radius:8px;color:#e6f0fb"></label>
          <label style="font-size:12px;color:#c3ccda"><input id="bf-active" type="checkbox" checked> 활성</label>
          <span style="flex:1"></span>
          <button class="ad-btn" id="bf-reset">초기화</button>
          <button class="ad-btn primary" id="bf-save">저장</button>
        </div>
        <input type="hidden" id="bf-id">
      </div>
      <div class="ad-segs" id="b-filter" style="margin-bottom:12px">${BRAIN_KINDS.map(([k, l]) => `<button data-v="${k}" class="${brainKind === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div id="b-list"><div class="ad-loading">불러오는 중…</div></div>`;

    const g = id => document.getElementById(id);
    const fillForm = (p) => {
      g("bf-id").value = p?.id || ""; g("bf-kind").value = p?.kind || brainKind; g("bf-ct").value = p?.content_type || "general";
      g("bf-style").value = p?.style || ""; g("bf-sd").value = p?.style_desc || ""; g("bf-formula").value = p?.formula || "";
      g("bf-ex").value = p?.examples || ""; g("bf-guide").value = p?.guide || ""; g("bf-weight").value = p?.weight || 3; g("bf-active").checked = p ? !!p.active : true;
      g("bf-save").textContent = p?.id ? "수정 저장" : "저장";
    };
    fillForm(null); g("bf-kind").value = brainKind;

    // 📊 창작 대행 계측(클로즈드 베타 실사용·실결제) — 30일
    (async () => {
      const s = await rpc("admin_creation_stats", { p_days: 30 });
      const box = g("b-stats"); if (!box) return;
      if (!s || s.error) { box.innerHTML = ""; return; }
      const rev = (s.gp_spent_thumbnail || 0) + (s.gp_spent_video || 0) - Math.abs(s.gp_refunded || 0);
      const cell = (label, val, sub) => `<div style="flex:1;min-width:96px;background:#111a28;border:1px solid #223047;border-radius:12px;padding:11px 13px">
        <div style="font-size:11px;color:#7d8ba0;margin-bottom:3px">${label}</div>
        <div style="font-size:20px;font-weight:800;color:#e6f0fb">${val}</div>${sub ? `<div style="font-size:10px;color:#5f6c80;margin-top:2px">${sub}</div>` : ""}</div>`;
      box.innerHTML = `<div style="font-size:12px;color:#7d8ba0;font-weight:700;margin-bottom:7px">📊 창작 대행 실사용 · 실결제 (최근 30일)</div>
        <div style="display:flex;gap:9px;flex-wrap:wrap">
          ${cell("제작", (s.thumbnails || 0) + (s.videos || 0), `썸네일 ${s.thumbnails || 0} · 영상 ${s.videos || 0}`)}
          ${cell("제작 유저", s.creators || 0, "생성 경험")}
          ${cell("창작 매출(GP)", rev.toLocaleString(), `환불 ${Math.abs(s.gp_refunded || 0)}`)}
          ${cell("결제 유저", s.paying_users || 0, "GP 실차감")}
          ${cell("발행 콘텐츠", s.published_posts || 0, "숏판·롱판")}
        </div>`;
    })();

    g("bf-reset").onclick = () => fillForm(null);
    g("bf-save").onclick = async () => {
      const args = { p_id: g("bf-id").value ? Number(g("bf-id").value) : null, p_kind: g("bf-kind").value, p_content_type: g("bf-ct").value,
        p_style: g("bf-style").value.trim() || null, p_style_desc: g("bf-sd").value.trim() || null, p_formula: g("bf-formula").value.trim(),
        p_examples: g("bf-ex").value.trim() || null, p_guide: g("bf-guide").value.trim() || null, p_weight: Number(g("bf-weight").value) || 3, p_active: g("bf-active").checked };
      if (args.p_formula.length < 2) { alert("공식을 입력해줘"); return; }
      const r = await rpc("admin_pattern_save", args);
      if (r?.ok) { toast("저장됨"); fillForm(null); loadList(); } else alert("저장 실패: " + (r?.reason || ""));
    };
    $("#b-filter").onclick = e => { const b = e.target.closest("[data-v]"); if (!b) return; brainKind = b.dataset.v; $("#b-filter").querySelectorAll("button").forEach(x => x.classList.toggle("on", x.dataset.v === brainKind)); loadList(); };

    let ALL = [];
    async function loadList() {
      const d = await rpc("admin_patterns_list");
      ALL = (d?.rows) || [];
      const rows = ALL.filter(p => p.kind === brainKind);
      $("#b-list").innerHTML = rows.length ? rows.map(p => `<div class="ad-tip" data-id="${p.id}" style="${p.active ? "" : "opacity:.5"}">
        <div class="ad-tip-h"><b>${esc(p.style || "(무명)")}</b> <span class="ad-tag st-done">${esc(p.content_type)}</span>
          <span class="ad-tk-m">중요도 ${p.weight} · 🏆선택 ${p.picked_count || 0} · 📈성과 ${p.perf_boost || 0} · 랭크 ${p.eff_score || 0} · ${p.active ? "활성" : "비활성"}${p.style_desc ? " · " + esc(p.style_desc) : ""}</span></div>
        <div class="ad-tip-b">${esc(p.formula)}</div>
        ${p.examples ? `<div class="ad-tk-m" style="margin-top:4px">예: ${esc(p.examples)}</div>` : ""}
        ${p.guide ? `<div class="ad-tk-m">⚠ ${esc(p.guide)}</div>` : ""}
        <div class="ad-tip-acts"><button class="ad-btn" data-act="edit">✏️ 수정</button><button class="ad-btn danger" data-act="del">🗑 삭제</button></div>
      </div>`).join("") : `<div class="ad-soon">이 종류의 패턴이 없어요. 위에서 추가해보세요.</div>`;
    }
    $("#b-list").onclick = async e => {
      const b = e.target.closest("[data-act]"); if (!b) return;
      const id = Number(b.closest(".ad-tip").dataset.id); const p = ALL.find(x => x.id === id);
      if (b.dataset.act === "edit") { fillForm(p); window.scrollTo({ top: 0, behavior: "smooth" }); }
      else if (b.dataset.act === "del") { if (!confirm("이 패턴을 삭제할까요?")) return; const r = await rpc("admin_pattern_delete", { p_id: id }); if (r?.ok) { toast("삭제됨"); loadList(); } else alert("삭제 실패"); }
    };
    loadList();
  }

  // ─────────── 운영·감사 ───────────
  async function renderOps() {
    main().innerHTML = `<h1 class="ad-h1">⚙️ 운영·감사</h1>
      <div class="ad-grid2">
        <div class="ad-card"><div class="ad-card-h">📢 전체 공지 발송</div>
          <input id="o-msg" class="ad-input" placeholder="공지 메시지 (전 회원 알림)"><button class="ad-btn primary" id="o-send" style="margin-top:8px">발송</button></div>
        <div class="ad-card"><div class="ad-card-h">🏆 시즌 정산</div>
          <div class="ad-note">현재 시즌을 종료하고 TOP3에 시즌 칭호 지급 + 다음 시즌 시작.</div>
          <button class="ad-btn danger" id="o-season" style="margin-top:8px">이번 시즌 정산 실행</button></div>
      </div>
      <div class="ad-card"><div class="ad-card-h">🧾 감사 로그</div><div id="o-audit"><div class="ad-loading">불러오는 중…</div></div></div>`;
    $("#o-send").onclick = async () => { const m = $("#o-msg").value.trim(); if (!m) return; if (!confirm("전 회원에게 공지를 발송할까요?")) return; const r = await rpc("admin_broadcast", { p_message: m }); if (r?.ok) toast(`${fmt(r.sent)}명에게 발송`); };
    $("#o-season").onclick = async () => { if (!confirm("이번 시즌을 정산할까요? (되돌릴 수 없음)")) return; const r = await rpc("season_resolve"); if (r?.ok) toast("시즌 정산 완료"); else alert("정산 실패: " + (r?.reason || "")); };
    const a = await rpc("admin_audit_list", { p_limit: 60 });
    const rows = a?.rows || [];
    $("#o-audit").innerHTML = rows.length ? `<table class="ad-table"><thead><tr><th>시각</th><th>관리자</th><th>액션</th><th>대상</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${ago(r.created_at)}</td><td>${esc(r.actor || "-")}</td><td><span class="ad-tag">${esc(r.action)}</span></td><td>${esc(r.target || "")}</td></tr>`).join("")}</tbody></table>` : `<div class="ad-soon">기록이 없어요.</div>`;
  }

  window.GALLA_ADMIN = { route };
  boot();
})();
