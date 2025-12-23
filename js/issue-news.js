console.log("[issue-news.js] loaded");

let requested = false;
let polling = false;

export async function loadAiNews(issue) {
  const supabase = window.supabaseClient;
  if (!supabase || !issue?.id) return;

  /* ==================================================
     1) done 뉴스 먼저 조회
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

  if (rows && rows.length >= 2) {
    render(rows);
    return;
  }

  /* ==================================================
     2) job 상태 확인
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

  const status = jobs?.[0]?.status ?? "none";

  /* ==================================================
     3) 기사 부족 → UX 카드 노출 (핵심)
  ================================================== */
  if (status === "insufficient") {
    renderInsufficient();
    return;
  }

  /* ==================================================
     4) pending → 폴링
  ================================================== */
  if (status === "pending") {
    poll(issue, 2000);
    return;
  }

  /* ==================================================
     5) failed / none → 단 1회만 생성 요청
  ================================================== */
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
   RENDER
================================================== */
function render(list) {
  document.getElementById("ai-skeleton-pro")?.remove();
  document.getElementById("ai-skeleton-con")?.remove();

  draw("ai-news-pro", list.filter((n) => n.stance === "pro"));
  draw("ai-news-con", list.filter((n) => n.stance === "con"));

  document.querySelector(".ai-news")?.removeAttribute("hidden");
}

function renderInsufficient() {
  document.getElementById("ai-skeleton-pro")?.remove();
  document.getElementById("ai-skeleton-con")?.remove();

  const pro = document.getElementById("ai-news-pro");
  const con = document.getElementById("ai-news-con");

  if (pro) {
    pro.innerHTML = `
      <div class="ai-news-placeholder">
        <div class="ai-news-placeholder-title">
          아직 언론에서 충분히 다뤄지지 않은 논점입니다
        </div>
        <div class="ai-news-placeholder-desc">
          이 이슈는 의견과 논점은 존재하지만,<br/>
          복수의 언론 보도가 확인되기 전까지는<br/>
          뉴스 영역이 활성화되지 않습니다.
        </div>
        <div class="ai-news-placeholder-sub">
          언론 보도가 축적되면 자동으로 반영됩니다.
        </div>
      </div>
    `;
  }

  if (con) con.innerHTML = "";
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
    el.onclick = () =>
      window.open(n.link, "_blank", "noopener,noreferrer");

    root.appendChild(el);
  });
}