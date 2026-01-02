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
export async function loadAiArguments(issue) {
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
    await generateAiArguments(issue);
    await waitForArguments(issue.id);
    return loadAiArguments(issue); // 🔥 이 줄 추가
  }

  /* 3️⃣ DOM 렌더 */
  renderArguments(pro, con);
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
function renderArguments(pro, con) {
  const wrap = document.getElementById("ai-argument-card");
  if (!wrap) return;

const proEl = document.getElementById("ai-argument-pro-line");
const conEl = document.getElementById("ai-argument-con-line");

  if (proEl) {
    proEl.innerHTML = `<p>${pro.title}</p>`;
  }

  if (conEl) {
    conEl.innerHTML = `<p>${con.title}</p>`;
  }

  wrap.removeAttribute("hidden");
}