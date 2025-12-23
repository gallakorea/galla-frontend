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

    // ✅ DB에 있으면 무조건 렌더 (다른 API 에러 무시)
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

    // ❗ 여기부터는 "생성 로직"
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
    // 🔥 이게 제일 중요
    console.error("[issue-news] fatal but isolated error", e);
  }
}

function render(list) {
  try {
    const pro = list.filter(n => n.stance === "pro");
    const con = list.filter(n => n.stance === "con");

    draw("ai-news-pro", pro);
    draw("ai-news-con", con);

    document.querySelector(".ai-news")?.removeAttribute("hidden");
  } catch (e) {
    console.error("[issue-news] render error", e);
  }
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