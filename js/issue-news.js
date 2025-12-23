console.log("[issue-news.js] loaded");

let requested = false;

export async function loadAiNews(issue) {
  try {
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

    /* ==================================================
       1️⃣ DB에 뉴스가 있으면 → 무조건 렌더
    ================================================== */
    if (data && data.length > 0) {
      const valid = data.filter(
        n =>
          n.title &&
          n.link &&
          (n.stance === "pro" || n.stance === "con")
      );

      if (valid.length > 0) {
        render(valid);
        return;
      }
    }

    /* ==================================================
       2️⃣ 여기부터는 생성 로직 (단 1회)
    ================================================== */
    if (requested) {
      console.log(
        `[issue-news] already requested generate (issue=${issue.id})`
      );
      return;
    }

    requested = true;
    console.log("[issue-news] no news → invoke generate-ai-news");

    await supabase.functions.invoke("generate-ai-news", {
      body: {
        issue_id: issue.id,
        title: issue.title,
        description: issue.description || issue.one_line,
      },
    });

    // 🔁 생성 후 재조회
    setTimeout(() => loadAiNews(issue), 2000);

  } catch (e) {
    // 🔥 다른 기능에 영향 안 주도록 고립
    console.error("[issue-news] fatal but isolated error", e);
  }
}

/* ==================================================
   RENDER
================================================== */
function render(list) {
  try {
    // 🔥 skeleton 제거 (핵심)
    document.getElementById("ai-skeleton-pro")?.remove();
    document.getElementById("ai-skeleton-con")?.remove();

    const pro = list.filter(n => n.stance === "pro");
    const con = list.filter(n => n.stance === "con");

    draw("ai-news-pro", pro);
    draw("ai-news-con", con);

    const section = document.querySelector(".ai-news");
    section?.removeAttribute("hidden");

  } catch (e) {
    console.error("[issue-news] render error", e);
  }
}

/* ==================================================
   DRAW
================================================== */
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