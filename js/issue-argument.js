console.log("[issue-argument.js] loaded");

/* ==========================================================================
   Utils (의존 최소화)
========================================================================== */
function qs(id) {
  return document.getElementById(id);
}

/* ==========================================================================
   Load AI Arguments
========================================================================== */
export async function loadAiArguments(issue, _retried = false) {
  const supabase = window.supabaseClient;
  if (!supabase || !issue?.id) return;

  /* 1️⃣ 기존 논점 조회 */
  const { data: args, error } = await supabase
    .from("ai_news")
    .select("stance, title")
    .eq("issue_id", issue.id)
    .eq("mode", "argument");

  if (error) {
    console.error("[arguments load error]", error);
    return;
  }

  const pro = args.find(a => a.stance === "pro");
  const con = args.find(a => a.stance === "con");

  /* 2️⃣ 논점이 없으면 생성 */
  if (!pro || !con) {
    // 생성 실패(일일 상한 등)면 한 번만 다시 본다 — 예전엔 무한 재귀로 시청자마다 계속 생성을 호출했다(26.10.11)
    if (_retried) return;
    await generateAiArguments(issue);
    await waitForArguments(issue.id);
    return loadAiArguments(issue, true);
  }

  /* 3️⃣ DOM 렌더 */
  renderArguments(pro, con, issue);
}

/* ==========================================================================
   Generate AI Arguments
========================================================================== */
async function generateAiArguments(issue) {
  const supabase = window.supabaseClient;

  console.log("[arguments] generate");

  await supabase.functions.invoke("generate-ai-arguments", {
    body: {
      issue_id: issue.id,
      title: issue.title,
      description: issue.description || issue.one_line || "",
      one_line: issue.one_line || "",
      author_stance: issue.author_stance
    }
  });
}

/* ==========================================================================
   Wait Arguments (Polling)
========================================================================== */
async function waitForArguments(issueId, retry = 10) {
  const supabase = window.supabaseClient;

  for (let i = 0; i < retry; i++) {
    const { data } = await supabase
      .from("ai_news")
      .select("stance")
      .eq("issue_id", issueId)
      .eq("mode", "argument");

    const hasPro = data?.some(d => d.stance === "pro");
    const hasCon = data?.some(d => d.stance === "con");

    if (hasPro && hasCon) return true;

    await new Promise(r => setTimeout(r, 700));
  }

  console.warn("[arguments] timeout");
  return false;
}

/* ==========================================================================
   Render
========================================================================== */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function renderArguments(pro, con, issue) {
  const wrap = document.getElementById("ai-argument-card");
  if (!wrap) return;

  const aName = esc(issue?.faction_a || "찬성");
  const bName = esc(issue?.faction_b || "반대");

  const proEl = document.getElementById("ai-argument-pro-line");
  const conEl = document.getElementById("ai-argument-con-line");

  if (proEl) {
    proEl.innerHTML = `<span class="arg-label">👍 ${aName} 측 논점</span><p>${esc(pro.title)}</p>`;
  }
  if (conEl) {
    conEl.innerHTML = `<span class="arg-label">👎 ${bName} 측 논점</span><p>${esc(con.title)}</p>`;
  }

  wrap.removeAttribute("hidden");
}