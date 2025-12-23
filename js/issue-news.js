console.log("[issue-news.js] loaded");

let generating = false;

export async function loadAiNews(issue, retry = false) {
  const supabase = window.supabaseClient;
  if (!supabase || !issue?.id) return;

  const { data, error } = await supabase
    .from("ai_news")
    .select("stance, title, link, source, created_at")
    .eq("issue_id", issue.id)
    .eq("mode", "news")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[issue-news] fetch error", error);
    return;
  }

  if (!data || data.length === 0) {
    console.log(
      `[issue-news] no news → invoke generate-ai-news (retry=${retry})`
    );

    if (!retry && !generating) {
      generating = true;

      await supabase.functions.invoke("generate-ai-news", {
        body: {
          issue_id: issue.id,
          title: issue.title,
          description: issue.description || issue.one_line,
        },
      });

      setTimeout(() => {
        loadAiNews(issue, true);
      }, 2000);
    }

    return;
  }

  const valid = data.filter(
    n => n.title && n.link && (n.stance === "pro" || n.stance === "con")
  );

  if (valid.length === 0) {
    console.warn("[issue-news] fetched but no valid rows");
    return;
  }

  render(valid);
}

function render(list) {
  const pro = list.filter(n => n.stance === "pro");
  const con = list.filter(n => n.stance === "con");

  draw("ai-news-pro", pro);
  draw("ai-news-con", con);

  document.querySelector(".ai-news")?.removeAttribute("hidden");
}

function draw(containerId, list) {
  const root = document.getElementById(containerId);
  if (!root) return;

  root.innerHTML = "";

  list.slice(0, 3).forEach(n => {
    const item = document.createElement("div");
    item.className = "ai-news-item";

    item.innerHTML = `
      <div class="ai-news-card">
        <div class="ai-news-source">${n.source}</div>
        <div class="ai-news-title">${n.title}</div>
      </div>
    `;

    item.onclick = () =>
      window.open(n.link, "_blank", "noopener,noreferrer");

    root.appendChild(item);
  });
}