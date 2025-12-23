console.log("[issue-news.js] loaded");

let requested = false;
let polling = false;

export async function loadAiNews(issue) {
  const supabase = window.supabaseClient;
  if (!supabase || !issue?.id) return;

  /* ==================================================
     1) ai_news 에 done 기사 있는지 먼저 확인
  ================================================== */
  const { data: rows, error: rowsErr } = await supabase
    .from("ai_news")
    .select("*")
    .eq("issue_id", issue.id)
    .eq("mode", "news")
    .eq("status", "done");

  if (rowsErr) {
    console.error("[issue-news] ai_news fetch error", rowsErr);
    return;
  }

  // 기사 2개 이상이면 정상 렌더
  if (rows && rows.length >= 2) {
    render(rows);
    return;
  }

  /* ==================================================
     2) ai_news_jobs 상태 확인
  ================================================== */
  const { data: jobs, error: jobsErr } = await supabase
    .from("ai_news_jobs")
    .select("status")
    .eq("issue_id", issue.id)
    .eq("mode", "news")
    .limit(1);

  if (jobsErr) {
    console.error("[issue-news] ai_news_jobs fetch error", jobsErr);
    return;
  }

  const status = jobs?.[0]?.status || "none";

  /* ==================================================
     🔥 핵심 분기: 기사 부족 (insufficient)
     → 실패 아님 / 대체 UI 렌더
  ================================================== */
  if (status === "insufficient") {
    renderInsufficient();
    return;
  }

  /* ==================================================
     3) 생성 중이면 폴링
  ================================================== */
  if (status === "pending") {
    poll(issue, 2000);
    return;
  }

  /* ==================================================
     4) 아직 요청 안 했으면 생성 요청 (1회)
  ================================================== */
  if (!requested) {
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

/* ==================================================
   Poll helper
================================================== */
function poll(issue, ms) {
  if (polling) return;
  polling = true;

  setTimeout(async () => {
    polling = false;
    await loadAiNews(issue);
  }, ms);
}

/* ==================================================
   RENDER (정상 기사)
================================================== */
function render(list) {
  // skeleton 제거
  document.getElementById("ai-skeleton-pro")?.remove();
  document.getElementById("ai-skeleton-con")?.remove();

  draw("ai-news-pro", list.filter((n) => n.stance === "pro"));
  draw("ai-news-con", list.filter((n) => n.stance === "con"));

  document.querySelector(".ai-news")?.removeAttribute("hidden");
}

/* ==================================================
   🔥 기사 부족 대체 UI
================================================== */
function renderInsufficient() {
  // skeleton 제거
  document.getElementById("ai-skeleton-pro")?.remove();
  document.getElementById("ai-skeleton-con")?.remove();

  const pro = document.getElementById("ai-news-pro");
  const con = document.getElementById("ai-news-con");

  if (pro) {
    pro.innerHTML = `
      <div class="ai-news-placeholder">
        아직 이 이슈는 언론 기사로 충분히 다뤄지지 않았습니다.
        <br />
        보도가 축적되면 자동으로 반영됩니다.
      </div>
    `;
  }

  if (con) {
    con.innerHTML = "";
  }

  document.querySelector(".ai-news")?.removeAttribute("hidden");
}

/* ==================================================
   DRAW
================================================== */
function draw(id, list) {
  const root = document.getElementById(id);
  if (!root) return;

  root.innerHTML = "";

  list.slice(0, 3).forEach((n) => {
    const el = document.createElement("div");
    el.className = "ai-news-item";

    el.innerHTML = `
      <div class="ai-news-card">
        <div class="ai-news-source">${n.source || ""}</div>
        <div class="ai-news-title">${n.title || ""}</div>
      </div>
    `;

    el.onclick = () => window.open(n.link, "_blank", "noopener,noreferrer");
    root.appendChild(el);
  });
}