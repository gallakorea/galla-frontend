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
  const MODS = { dashboard: renderDashboard, content: renderContent, members: renderMembers, reports: renderReports, tips: renderTips, bugs: renderBugs, settle: renderSettle, support: renderSupport, upload: renderUpload, ops: renderOps };
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
        ${mini("📝 갈라 발의", td.issues, "content")}${mini("🗳️ 투표", td.votes)}${mini("💬 댓글", td.comments, "content")}${mini("⚔️ 일기토", td.duels, "content")}${mini("📈 예측거래", td.trades, "content")}${mini("🙋 신규가입", td.signups, "members")}</div></div>`;
    countUp($("#k-rt"), t.realtime); countUp($("#k-dau"), t.dau); countUp($("#k-wau"), t.wau); countUp($("#k-mau"), t.mau); countUp($("#k-total"), t.total_users);
    // 카드 클릭 → 해당 모듈로 즉시 이동 (영속 #ad-main에 1회만 위임 등록)
    if (!main().__goWired) { main().__goWired = true; main().addEventListener("click", e => { const g = e.target.closest("[data-go]"); if (g) navTo(g.dataset.go); }); }
    // 실시간 접속 현황(회원 명단/비회원 수/지역) — 최초 렌더 + 20초 자동 갱신
    paintPresence();
    clearInterval(dashPresenceTimer);
    dashPresenceTimer = setInterval(() => { if ($("#ad-presence")) paintPresence(); else clearInterval(dashPresenceTimer); }, 20000);
  }
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
    const d = await rpc("admin_users", { p_filter: mFilter, p_q: mQ || null, p_limit: 60 });
    const rows = d?.rows || [];
    $("#m-list").innerHTML = rows.length ? `<table class="ad-table"><thead><tr><th>닉네임</th><th>Lv</th><th>보유 GP</th><th>누적 GP</th><th>경고</th><th>상태</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.nickname || "익명")}${r.admin ? ' <span class="ad-tag t-admin">관리자</span>' : ''}</td>
        <td>${r.level || 1}</td><td>${fmt(r.gp)}</td><td>${fmt(r.lifetime)}</td>
        <td>${r.warning > 0 ? `<span class="ad-warn">${r.warning}</span>` : "0"}</td>
        <td>${r.banned ? '<span class="ad-tag t-ban">정지</span>' : '정상'}</td>
        <td><button class="ad-btn ghost" data-uid="${r.user_id}">관리</button></td></tr>`).join("")}
      </tbody></table>` : `<div class="ad-soon">해당 회원이 없어요.</div>`;
    $("#m-list").onclick = e => { const b = e.target.closest("[data-uid]"); if (b) openMember(b.dataset.uid); };
  }
  async function openMember(uid) {
    const d = await rpc("admin_user_detail", { p_user: uid });
    if (!d?.ok) { alert("조회 실패"); return; }
    const w = modal(`<div class="ad-modal-h">👤 ${esc(d.nickname || "익명")} ${d.admin ? '<span class="ad-tag t-admin">관리자</span>' : ''} ${d.banned ? '<span class="ad-tag t-ban">정지</span>' : ''}</div>
      <div class="ad-mstat">${[["발의", d.issues], ["댓글", d.comments], ["투표", d.votes], ["보유GP", d.gp], ["경고", d.warning], ["피신고", d.reports_against]].map(([l, v]) => `<div><b>${fmt(v)}</b><span>${l}</span></div>`).join("")}</div>
      ${d.email ? `<div class="ad-mrow">✉️ ${esc(d.email)} · 가입 ${ago(d.created_at)}</div>` : ""}
      ${d.banned ? `<div class="ad-mrow ban">⛔ 정지 사유: ${esc(d.ban_reason || "-")}</div>` : ""}
      <div class="ad-mactions">
        <button class="ad-btn ghost" data-a="warn+">⚠️ 경고 +1</button>
        <button class="ad-btn ghost" data-a="warn-">경고 -1</button>
        <button class="ad-btn ghost" data-a="gp">💰 GP 지급</button>
        ${d.banned ? `<button class="ad-btn primary" data-a="unban">✅ 정지 해제</button>` : `<button class="ad-btn danger" data-a="ban">⛔ 정지</button>`}
        <button class="ad-btn ${d.admin ? "danger" : "primary"}" data-a="role">${d.admin ? "관리자 해제" : "관리자 지정"}</button>
        ${d.admin ? "" : `<button class="ad-btn danger" data-a="delete">🗑 회원 삭제</button>`}
      </div>`);
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
    const tabs = [["issue", "📝 이슈"], ["plaza", "💬 광장"], ["market", "📈 예측"], ["news", "📰 뉴스"]];
    main().innerHTML = `<h1 class="ad-h1">⬆️ 직접 업로드</h1>
      <div class="ad-segs" id="u-tab" style="margin-bottom:14px">${tabs.map(([k, l]) => `<button data-v="${k}" class="${upTab === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div class="ad-card ad-form" id="u-form"></div>`;
    $("#u-tab").onclick = e => { const b = e.target.closest("[data-v]"); if (!b) return; upTab = b.dataset.v; renderUpload(); };
    ({ issue: upIssue, plaza: upPlaza, market: upMarket, news: upNews }[upTab])();
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
  function upIssue() {
    issueLinks = [];
    $("#u-form").innerHTML =
      IN("i-title", "제목 *", "이슈 제목") + IN("i-one", "한줄 요약", "카드에 뜨는 한 줄") +
      TA("i-desc", "설명", "이슈 상세 설명") + IN("i-cat", "카테고리", "", "사회") +
      `<div class="ad-2col">${IN("i-fa", "진영 A", "👍 찬성이오")}${IN("i-fb", "진영 B", "👎 난 반댈세")}</div>` +
      IN("i-thumb", "썸네일 이미지 URL", "https://…") +
      `<label>관련 링크 · 근거</label>
       <div class="ad-link-add"><input id="i-link-url" class="ad-input" placeholder="뉴스·커뮤니티·유튜브·자료 등 URL 붙여넣기 → 추가" style="margin:0">
       <button class="ad-btn ghost" id="i-link-go" type="button">추가</button></div>
       <div id="i-links" class="ad-links"></div>` +
      `<button class="ad-btn primary" id="i-go">🚀 이슈 발행</button><div class="ad-note">진영명 비우면 기본(찬성이오/난 반댈세). 관련 링크는 이슈 하단에 근거 카드로 뜨고 클릭 시 외부로 이동합니다.</div>`;
    renderIssueLinks();
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
      const t = $("#i-title").value.trim(); if (!t) return $("#i-title").focus();
      const r = await rpc("admin_publish_issue", { p_title: t, p_one_line: $("#i-one").value.trim(), p_desc: $("#i-desc").value.trim(), p_category: $("#i-cat").value.trim() || "사회", p_faction_a: $("#i-fa").value.trim(), p_faction_b: $("#i-fb").value.trim(), p_thumb: $("#i-thumb").value.trim(), p_links: issueLinks });
      if (r?.ok) { toast("이슈 발행됨"); location.href = "issue.html?id=" + r.id; } else alert("발행 실패");
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
