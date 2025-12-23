console.log("[issue-news.js] loaded");

/**
 * 이 세션에서 generate를 시도한 issue id 기록
 * → 새로고침하면 초기화됨
 */
let requestedIssueId = null;

export async function loadAiNews(issue) {
  try {
    const supabase = window.supabaseClient;
    if (!supabase || !issue?.id) return;

    /* ==================================================
       1️⃣ DB 조회 (news 모드만)
    ================================================== */
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
       2️⃣ DB에 뉴스가 있으면 → 무조건 렌더
    ================================================== */
    if (Array.isArray(data) && data.length > 0) {
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
       3️⃣ 뉴스 없음 → 생성 로직 (이슈당 1회)
    ================================================== */
    if (requestedIssueId === issue.id) {
      console.log(
        `[issue-news] already requested generate (issue=${issue.id})`
      );
      return;
    }

    requestedIssueId = issue.id;
    console.log("[issue-news] no news → invoke generate-ai-news");

    // skeleton 안내 텍스트 유지 (UX 안정)
    document.querySelector("#ai-skeleton-pro .sk-line")?.replaceWith(
      document.createTextNode("관련 뉴스를 수집 중입니다…")
    );

    await supabase.functions.invoke("generate-ai-news", {
      body: {
        issue_id: issue.id,
        title: issue.title,
        description: issue.description || issue.one_line,
      },
    });

    /* ==================================================
       4️⃣ 생성 후 재조회 (단순 폴링 1회)
    ================================================== */
    setTimeout(() => loadAiNews(issue), 2000);

  } catch (e) {
    // 🔥 다른 기능 절대 방해하지 않도록 고립
    console.error("[issue-news] fatal but isolated error", e);
  }
}

/* ==================================================
   RENDER
================================================== */
function render(list) {
  try {
    // skeleton 제거
    document.getElementById("ai-skeleton-pro")?.remove();
    document.getElementById("ai-skeleton-con")?.remove();

    const pro = list.filter(n => n.stance === "pro");
    const con = list.filter(n => n.stance === "con");

    draw("ai-news-pro", pro);
    draw("ai-news-con", con);

    document.querySelector(".ai-news")?.removeAttribute("hidden");

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
        <div class="ai-news-source">${n.source ?? "news"}</div>
        <div class="ai-news-title">${n.title}</div>
      </div>
    `;

    item.onclick = () =>
      window.open(n.link, "_blank", "noopener,noreferrer");

    root.appendChild(item);
  });
}