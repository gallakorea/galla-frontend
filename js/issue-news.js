console.log("[issue-news.js] loaded");

/* ==========================================================================
   Public Entry (issue.js에서 호출)
========================================================================== */
export async function loadAiNews(issue) {
  const supabase = window.supabaseClient;
  if (!supabase || !issue?.id) return;

  await ensureNews(supabase, issue);
  await loadNews(supabase, issue.id);
}

/* ==========================================================================
   1. 뉴스 존재 확인 → 없으면 생성
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
      author_stance: issue.author_stance,
      title: issue.title,
      description: issue.description || issue.one_line
    }
  });

  await waitForNews(supabase, issue.id);
}

async function waitForNews(supabase, issueId, retry = 10) {
  for (let i = 0; i < retry; i++) {
    const { data } = await supabase
      .from("ai_news")
      .select("stance")
      .eq("issue_id", issueId)
      .eq("mode", "news");

    const pro = data?.some(n => n.stance === "pro");
    const con = data?.some(n => n.stance === "con");

    if (pro && con) return true;
    await new Promise(r => setTimeout(r, 800));
  }

  console.warn("[issue-news] timeout");
  return false;
}

/* ==========================================================================
   2. 뉴스 로드
========================================================================== */
async function loadNews(supabase, issueId) {
  const { data, error } = await supabase
    .from("ai_news")
    .select("id, stance, title, link, source")
    .eq("issue_id", issueId)
    .eq("mode", "news")
    .order("id", { ascending: true });

  if (error || !data) return;

  const pro = [];
  const con = [];

  data.forEach(n => {
    if (n.stance === "pro") pro.push(n);
    if (n.stance === "con") con.push(n);
  });

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

  list.slice(0, 3).forEach(n => {
    const item = document.createElement("div");
    item.className = "ai-news-item";

    item.innerHTML = `
      <div class="ai-news-card">
        <div class="ai-news-source">${resolveSource(n.source)}</div>
        <div class="ai-news-title">${n.title}</div>
      </div>
    `;

    item.addEventListener("click", () => {
      if (n.link) window.open(n.link, "_blank", "noopener");
    });

    root.appendChild(item);
  });
}

function resolveSource(source) {
  if (source === "naver") return "네이버 뉴스";
  if (source === "google") return "Google 뉴스";
  return "뉴스";
}