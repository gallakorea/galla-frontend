console.log("[issue-news.js] loaded");

let requested = false;
let polling = false;

export async function loadAiNews(issue) {
  const supabase = window.supabaseClient;
  if (!supabase || !issue?.id) return;

  /* ==================================================
     1) done 뉴스 조회
  ================================================== */
  const { data: rows } = await supabase
    .from("ai_news")
    .select("*")
    .eq("issue_id", issue.id)
    .eq("mode", "news")

  if (rows && rows.length >= 2) {
    render(rows);
    return;
  }


  /* ==================================================
     2) job 상태 조회
     ⚠️ row 자체가 없을 수 있음
  ================================================== */
  const { data: jobs } = await supabase
    .from("ai_news_jobs")
    .select("status")
    .eq("issue_id", issue.id)
    .eq("mode", "news")
    .limit(1);

  const job = jobs?.[0];

  /* ==================================================
     🔥 핵심 분기
  ================================================== */

  // ✅ job row 자체가 없음 → 기사 없음 취급
  if (!job) {
    renderInsufficient();
    return;
  }

  // ✅ 기사 부족 확정
  if (job.status === "insufficient") {
    renderInsufficient();
    return;
  }

  // ⏳ 생성 중
  if (job.status === "pending") {
    poll(issue, 2000);
    return;
  }

  // ❌ 실패했거나 처음인데, 자동 생성은 1회만
  if ((job.status === "failed" || job.status === "none") && !requested) {
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
   Poll
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

  draw("ai-news-pro", list.filter(n => n.stance === "pro"));
  draw("ai-news-con", list.filter(n => n.stance === "con"));

  document.querySelector(".ai-news")?.removeAttribute("hidden");
}

function renderInsufficient() {
  // 스켈레톤 제거
  document.getElementById("ai-skeleton-pro")?.remove();
  document.getElementById("ai-skeleton-con")?.remove();

  const section = document.querySelector(".ai-news");
  if (!section) return;

  section.removeAttribute("hidden");

  // 👍👎 기존 찬반 기사 영역 제거
  const pro = document.getElementById("ai-news-pro");
  const con = document.getElementById("ai-news-con");

  if (pro) pro.remove();
  if (con) con.remove();

  // 중복 삽입 방지
  if (section.querySelector(".ai-news-placeholder")) return;

  // 🔥 관련 뉴스 근거 카드 내부에 메시지 삽입
  const placeholder = document.createElement("div");
  placeholder.className = "ai-news-placeholder";
  placeholder.innerHTML = `
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
  `;

  section.appendChild(placeholder);
}

function draw(id, list) {
  const root = document.getElementById(id);
  if (!root) return;

  root.innerHTML = "";

  list.slice(0, 3).forEach(n => {
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