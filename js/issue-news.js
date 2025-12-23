console.log("[issue-news.js] loaded");

/* ==========================================================================
   Public Entry
========================================================================== */
export async function loadAiNews(issue, retry = false) {
  const supabase = window.supabaseClient;
  if (!supabase || !issue?.id) return;

  // 1️⃣ 이미 생성된 뉴스 조회
  const { data, error } = await supabase
    .from("ai_news")
    .select("stance, title, link, source")
    .eq("issue_id", issue.id)
    .eq("mode", "news")
    .order("id", { ascending: true });

  if (error) {
    console.error("[issue-news] fetch error", error);
    return;
  }

  // 2️⃣ 없으면 생성 요청 → 1회 재시도
  if (!data || data.length === 0) {
    console.log("[issue-news] no news → invoke generate-ai-news");

    // 최초 진입 시에만 생성 요청
    if (!retry) {
      supabase.functions.invoke("generate-ai-news", {
        body: {
          issue_id: issue.id,
          title: issue.title,
          description: issue.description || issue.one_line,
        },
      });

      // 🔥 2초 후 딱 한 번만 재조회
      setTimeout(() => {
        loadAiNews(issue, true);
      }, 2000);
    }

    return;
  }

  // 3️⃣ 있으면 바로 렌더
  render(data);
}

/* ==========================================================================
   Render
========================================================================== */
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
        <div class="ai-news-source">${n.source || "언론사"}</div>
        <div class="ai-news-title">${n.title}</div>
      </div>
    `;

    item.onclick = () => window.open(n.link, "_blank", "noopener");
    root.appendChild(item);
  });
}