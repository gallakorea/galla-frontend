console.log("[issue-news.js] loaded");

// ✅ issue_id 단위로 생성 요청 상태 관리
const requestedMap = new Set();

export async function loadAiNews(issue) {
  const supabase = window.supabaseClient;
  if (!supabase || !issue?.id) return;

  /* --------------------------------------------------
     1. DB에서 뉴스 조회
  -------------------------------------------------- */
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

  /* --------------------------------------------------
     2. DB에 뉴스가 있으면 → 무조건 렌더
     (과거 이슈 포함)
  -------------------------------------------------- */
  if (data && data.length > 0) {
    const valid = data.filter(
      n =>
        n.title &&
        n.link &&
        (n.stance === "pro" || n.stance === "con")
    );

    if (valid.length > 0) {
      console.log(
        `[issue-news] render from DB (issue=${issue.id}, count=${valid.length})`
      );
      render(valid);
      return;
    }
  }

  /* --------------------------------------------------
     3. DB에 없으면 → 이슈별로 단 1번만 생성
  -------------------------------------------------- */
  if (requestedMap.has(issue.id)) {
    console.log(
      `[issue-news] already requested generate (issue=${issue.id})`
    );
    return;
  }

  requestedMap.add(issue.id);

  console.log(
    `[issue-news] no news → invoke generate-ai-news (issue=${issue.id})`
  );

  await supabase.functions.invoke("generate-ai-news", {
    body: {
      issue_id: issue.id,
      title: issue.title,
      description: issue.description || issue.one_line,
    },
  });

  /* --------------------------------------------------
     4. 생성 후 재조회 (폴링)
  -------------------------------------------------- */
  setTimeout(() => {
    loadAiNews(issue);
  }, 2000);
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
        <div class="ai-news-source">${n.source}</div>
        <div class="ai-news-title">${n.title}</div>
      </div>
    `;

    item.onclick = () => {
      window.open(n.link, "_blank", "noopener,noreferrer");
    };

    root.appendChild(item);
  });
}