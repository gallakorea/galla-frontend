console.log("[issue-news.js] loaded");

/**
 * 뉴스 생성 요청은
 *  - DONE 없고
 *  - PENDING 아니고
 *  - FAILED 있거나 row 자체가 없을 때
 * 단 1회만 실행
 */
let requested = false;

export async function loadAiNews(issue) {
  const supabase = window.supabaseClient;
  if (!supabase || !issue?.id) return;

  try {
    /* ==================================================
       1️⃣ ai_news DONE 조회 (단일 진실)
    ================================================== */
    const { data: newsRows, error: newsError } = await supabase
      .from("ai_news")
      .select("id, stance, title, link, source, status, created_at")
      .eq("issue_id", issue.id)
      .eq("mode", "news")
      .order("created_at", { ascending: true });

    if (newsError) {
      console.error("[issue-news] ai_news fetch error", newsError);
      return;
    }

    const doneNews = (newsRows || []).filter(
      n =>
        n.status === "done" &&
        n.title &&
        n.link &&
        (n.stance === "pro" || n.stance === "con")
    );

    if (doneNews.length > 0) {
      console.log("[issue-news] render done news");
      render(doneNews);
      return;
    }

    /* ==================================================
       2️⃣ ai_news_jobs 상태 확인 (락 판단 핵심)
    ================================================== */
    const { data: jobRows, error: jobError } = await supabase
      .from("ai_news_jobs")
      .select("status")
      .eq("issue_id", issue.id)
      .eq("mode", "news")
      .limit(1);

    if (jobError) {
      console.error("[issue-news] ai_news_jobs fetch error", jobError);
      return;
    }

    const jobStatus = jobRows?.[0]?.status ?? null;

    // ⛔ 이미 생성 중이면 아무것도 안 함
    if (jobStatus === "pending") {
      console.log("[issue-news] job pending → wait");
      return;
    }

    // ⛔ 이미 job done인데 뉴스가 없으면 (비정상 상태) → 재시도 허용
    const hasFailed =
      (newsRows || []).some(n => n.status === "failed") ||
      jobStatus === "failed" ||
      !newsRows ||
      newsRows.length === 0;

    /* ==================================================
       3️⃣ 생성 요청 (단 1회)
    ================================================== */
    if (requested) {
      console.log(
        `[issue-news] already requested generate (issue=${issue.id})`
      );
      return;
    }

    if (hasFailed) {
      requested = true;

      console.log(
        `[issue-news] invoke generate-ai-news (issue=${issue.id})`
      );

      await supabase.functions.invoke("generate-ai-news", {
        body: {
          issue_id: issue.id,
          title: issue.title,
          description: issue.description || issue.one_line || "",
        },
      });

      // 🔁 2초 후 재확인 (Edge Function 기준)
      setTimeout(() => loadAiNews(issue), 2000);
    }

  } catch (e) {
    // 🔥 다른 기능에 영향 절대 없음
    console.error("[issue-news] fatal but isolated error", e);
  }
}

/* ==================================================
   RENDER
================================================== */
function render(list) {
  try {
    // 🔥 skeleton 제거
    document.getElementById("ai-skeleton-pro")?.remove();
    document.getElementById("ai-skeleton-con")?.remove();

    const pro = list.filter(n => n.stance === "pro");
    const con = list.filter(n => n.stance === "con");

    draw("ai-news-pro", pro);
    draw("ai-news-con", con);

    document
      .querySelector(".ai-news")
      ?.removeAttribute("hidden");

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