console.log("[issue-news.js] loaded");

/* ==================================================
   관련 보도 — 내부 수집 뉴스(news_articles_raw)에서
   이슈 키워드로 자동 매칭. 카드 클릭 시 원문(외부)으로 이동.
   서버 RPC: issue_related_news(issue_id)
================================================== */
export async function loadAiNews(issue) {
  const supabase = window.supabaseClient;
  if (!supabase || !issue?.id) return;

  const { data, error } = await supabase.rpc("issue_related_news", { p_issue_id: issue.id });
  const rows = data?.rows || [];

  if (error || !rows.length) { renderInsufficient(); return; }
  render(rows);
}

const A = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } }
function srcLabel(a) {
  const s = a.source || "";
  if (s === "naver_api" || s === "rss" || !s) return host(a.url) || "뉴스";
  return s;
}
function ago(ts) { if (window.GALLA_ago) return window.GALLA_ago(ts); 
  if (!ts) return "";
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 3600) return Math.max(1, Math.floor(d / 60)) + "분 전";
  if (d < 86400) return Math.floor(d / 3600) + "시간 전";
  return Math.floor(d / 86400) + "일 전";
}

function render(list) {
  const section = document.querySelector(".ai-news");
  if (!section) return;
  const cards = list.map(n => {
    const url = n.url;
    if (!url || !/^https?:\/\//i.test(url)) return "";
    return `<a class="report-card" href="${A(url)}" target="_blank" rel="noopener noreferrer">
      <div class="report-mid">
        <div class="report-src">${A(srcLabel(n))}${n.published_at ? ` · <span class="report-time">${ago(n.published_at)}</span>` : ""}</div>
        <div class="report-title">${A(n.title)}</div>
      </div>
      <div class="report-go">↗</div>
    </a>`;
  }).join("");

  section.innerHTML = `
    <div class="ai-box ai-news-box">
      <div class="ai-box-header">
        <h3 class="white-title">📰 관련 보도</h3>
        <p class="ai-tip">이 이슈를 다룬 실제 언론 보도입니다. 클릭하면 원문으로 이동합니다.</p>
      </div>
      <div class="report-list">${cards}</div>
    </div>`;
  section.removeAttribute("hidden");
}

function renderInsufficient() {
  const section = document.querySelector(".ai-news");
  if (!section) return;
  section.innerHTML = `
    <div class="ai-news-header">📰 관련 보도</div>
    <div class="ai-news-insufficient">
      <div class="ai-news-placeholder">
        <div class="ai-news-placeholder-title">아직 언론에서 다뤄지지 않은 논점입니다</div>
        <div class="ai-news-placeholder-desc">
          이 이슈와 매칭되는 최근 언론 보도가<br/>확인되지 않았습니다.
        </div>
        <div class="ai-news-placeholder-sub">보도가 축적되면 자동으로 반영됩니다.</div>
      </div>
    </div>`;
  section.removeAttribute("hidden");
}

/* ==================================================
   💬 바깥 반응(26.10.11) — 이슈 키워드로 네이버 카페·블로그에서 찾은 **실제 외부 글**.
   엣지 issue-outside 가 의미 유사도로 거른 것만 온다(관련 없으면 0건 → 섹션 자체를 안 그린다).
   초기 판의 빈 느낌을 조작 없이 채우는 장치 — 출처를 항상 밝힌다.
================================================== */
export async function loadOutside(issue) {
  const supabase = window.supabaseClient;
  if (!supabase || !issue?.id) return;
  let items = [];
  try {
    const { data } = await supabase.functions.invoke("issue-outside", { body: { issue_id: issue.id } });
    items = Array.isArray(data?.items) ? data.items : [];
  } catch (_) { return; }
  items = items.filter(it => it && /^https?:\/\//i.test(it.url || "") && it.title);
  if (!items.length) return;

  const news = document.querySelector(".ai-news");
  if (!news || !news.parentNode) return;
  let sec = document.querySelector(".issue-outside");
  if (!sec) { sec = document.createElement("section"); sec.className = "issue-outside"; news.parentNode.insertBefore(sec, news.nextSibling); }

  const cards = items.map(it => {
    const kind = it.kind === "blog" ? "블로그" : "카페";
    return `<a class="report-card" href="${A(it.url)}" data-link="${A(it.url)}" target="_blank" rel="noopener noreferrer">
      <div class="report-mid">
        <div class="report-src">${kind} · ${A(it.src)}</div>
        <div class="report-title">${A(it.title)}</div>
        ${it.desc ? `<div class="report-desc">${A(it.desc)}</div>` : ""}
      </div>
      <div class="report-go">↗</div>
    </a>`;
  }).join("");
  sec.innerHTML = `
    <div class="ai-box ai-news-box">
      <div class="ai-box-header">
        <h3 class="white-title">💬 바깥 반응</h3>
        <p class="ai-tip">다른 커뮤니티·블로그에서 이 이슈를 다룬 실제 글입니다. 누르면 원문으로 이동합니다.</p>
      </div>
      <div class="report-list">${cards}</div>
    </div>`;
  // 앱(웹뷰)에서 target=_blank 는 웹뷰를 갈아타 버린다 — 외부 링크는 공용 통로로
  sec.querySelectorAll("a[data-link]").forEach(a => a.addEventListener("click", e => {
    if (window.GALLA_openLink) { e.preventDefault(); window.GALLA_openLink(a.dataset.link); }
  }));
}
