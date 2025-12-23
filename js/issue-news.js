console.log("[issue-news.js] loaded");

let requested = false;
let polling = false;

export async function loadAiNews(issue) {
  const supabase = window.supabaseClient;
  if (!supabase || !issue?.id) return;

  /* 1) done 기사 조회 */
  const { data: rows } = await supabase
    .from("ai_news")
    .select("*")
    .eq("issue_id", issue.id)
    .eq("mode", "news")
    .eq("status", "done");

  if (rows && rows.length >= 2) {
    render(rows);
    return;
  }

  /* 2) job 상태 확인 */
  const { data: jobs } = await supabase
    .from("ai_news_jobs")
    .select("status")
    .eq("issue_id", issue.id)
    .eq("mode", "news")
    .limit(1);

  const status = jobs?.[0]?.status ?? "none";

  /* ✅ 기사 부족 → 절대 generate 다시 호출 금지 */
  if (status === "insufficient") {
    renderInsufficient();
    return;
  }

  /* pending → 대기 */
  if (status === "pending") {
    poll(issue, 2000);
    return;
  }

  /* failed / none 인 경우만 1회 생성 */
  if ((status === "failed" || status === "none") && !requested) {
    requested = true;

    await supabase.functions.invoke("generate-ai-news", {
      body: {
        issue_id: issue.id,
        title: issue.title,
        description: issue.description || "",
      },
    });

    poll(issue, 2000);
  }
}

function poll(issue, ms) {
  if (polling) return;
  polling = true;

  setTimeout(async () => {
    polling = false;
    await loadAiNews(issue);
  }, ms);
}

/* =========================
   RENDER
========================= */
function render(list) {
  document.getElementById("ai-skeleton-pro")?.remove();
  document.getElementById("ai-skeleton-con")?.remove();

  draw("ai-news-pro", list.filter((n) => n.stance === "pro"));
  draw("ai-news-con", list.filter((n) => n.stance === "con"));
}

function renderInsufficient() {
  document.getElementById("ai-skeleton-pro")?.remove();
  document.getElementById("ai-skeleton-con")?.remove();

  document.getElementById("ai-news-pro").innerHTML = `
    <div class="ai-news-placeholder">
      아직 이 이슈는 언론 기사로 충분히 다뤄지지 않았습니다.<br/>
      관련 보도가 축적되면 자동으로 반영됩니다.
    </div>
  `;
  document.getElementById("ai-news-con").innerHTML = "";
}

function draw(id, list) {
  const root = document.getElementById(id);
  if (!root) return;

  root.innerHTML = "";
  list.slice(0, 3).forEach((n) => {
    const el = document.createElement("div");
    el.className = "ai-news-item";
    el.innerHTML = `
      <div class="ai-news-card">
        <div class="ai-news-source">${n.source}</div>
        <div class="ai-news-title">${n.title}</div>
      </div>
    `;
    el.onclick = () => window.open(n.link, "_blank", "noopener,noreferrer");
    root.appendChild(el);
  });
}