console.log("[issue-news.js] loaded");

/* ==========================================================================
   Public Entry
========================================================================== */
export async function loadAiNews(issue) {
  const supabase = window.supabaseClient;
  if (!supabase || !issue?.id) return;

  await ensureNews(supabase, issue);
  await loadNews(supabase, issue.id);
}

/* ==========================================================================
   1. 생성 트리거
========================================================================== */
async function ensureNews(supabase, issue) {
  const { data } = await supabase
    .from("ai_news")
    .select("id")
    .eq("issue_id", issue.id)
    .eq("mode", "news")
    .limit(1);

  if (data && data.length > 0) return;

  await supabase.functions.invoke("generate-ai-news", {
    body: {
      issue_id: issue.id,
      title: issue.title,
      description: issue.description || issue.one_line,
    },
  });
}

/* ==========================================================================
   2. 로드
========================================================================== */
async function loadNews(supabase, issueId) {
  const { data } = await supabase
    .from("ai_news")
    .select("stance, title, link, source")
    .eq("issue_id", issueId)
    .eq("mode", "news")
    .order("id", { ascending: true });

  if (!data || data.length === 0) return;

  const pro = data.filter((n) => n.stance === "pro");
  const con = data.filter((n) => n.stance === "con");

  renderNews("ai-news-pro", pro);
  renderNews("ai-news-con", con);

  document.querySelector(".ai-news")?.removeAttribute("hidden");
}

/* ==========================================================================
   3. Render
========================================================================== */
function renderNews(containerId, list) {
  const root = document.getElementById(containerId);
  if (!root) return;

  root.innerHTML = "";

  list.forEach((n) => {
    const item = document.createElement("div");
    item.className = "ai-news-item";

    item.innerHTML = `
      <div class="ai-news-card">
        <div class="ai-news-source">${n.source}</div>
        <div class="ai-news-title">${n.title}</div>
      </div>
    `;

    item.onclick = () => {
      if (n.link) window.open(n.link, "_blank", "noopener");
    };

    root.appendChild(item);
  });
}