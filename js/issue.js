console.log("[issue.js] loaded");

/* ==========================================================================
   0. 기본 유틸
========================================================================== */
function qs(id) {
  return document.getElementById(id);
}

/* ==========================================================================
   1. URL에서 issue id 읽기
========================================================================== */
const params = new URLSearchParams(location.search);
const issueId = params.get("id");

if (!issueId) {
  alert("잘못된 접근입니다.");
  location.href = "index.html";
}

/* ==========================================================================
   2. Supabase 이슈 조회
========================================================================== */
(async function loadIssue() {
  if (!window.supabaseClient) {
    console.error("Supabase client not ready");
    return;
  }

  const supabase = window.supabaseClient;

  const { data: issue, error } = await supabase
    .from("issues")
    .select("*")
    .eq("id", issueId)
    .single();

  if (error || !issue) {
    console.error(error);
    alert("이슈를 불러올 수 없습니다.");
    return;
  }

  renderIssue(issue);
})();

/* ==========================================================================
   3. 이슈 렌더링
========================================================================== */
function renderIssue(issue) {
  // 카테고리 / 제목 / 설명
  qs("issue-category").innerText = issue.category || "";
  qs("issue-title").innerText = issue.title || "";
  qs("issue-desc").innerText = issue.description || "";

  // 작성 시간
  if (issue.created_at) {
    qs("issue-time").innerText =
      new Date(issue.created_at).toLocaleDateString();
  }

  // 작성자 (익명 고정)
  qs("issue-author").innerText = "작성자 · 익명";

  // 썸네일
  if (issue.thumbnail_url) {
    const { data } = window.supabaseClient
      .storage
      .from("issues")
      .getPublicUrl(issue.thumbnail_url);

    qs("issue-thumb").src = data.publicUrl;
  }

  // 영상
  if (issue.video_url) {
    qs("open-video-modal").style.display = "block";

    const { data } = window.supabaseClient
      .storage
      .from("issues")
      .getPublicUrl(issue.video_url);

    const videoEl = document.getElementById("speech-video");
    videoEl.src = data.publicUrl;
    videoEl.controls = true;
  } else {
    qs("open-video-modal").style.display = "none";
  }

  // 투표 수치
  renderVote(issue.pro_count || 0, issue.con_count || 0);

  // 후원 수치
  renderSupport(issue.sup_pro || 0, issue.sup_con || 0);
}

/* ==========================================================================
   4. 투표 UI
========================================================================== */
function renderVote(pro, con) {
  const total = pro + con || 1;
  const proPer = Math.round((pro / total) * 100);
  const conPer = 100 - proPer;

  qs("vote-pro-bar").style.width = `${proPer}%`;
  qs("vote-con-bar").style.width = `${conPer}%`;
  qs("vote-pro-text").innerText = `${proPer}%`;
  qs("vote-con-text").innerText = `${conPer}%`;
}

/* ==========================================================================
   5. 후원 UI
========================================================================== */
function renderSupport(pro, con) {
  const total = pro + con || 1;
  const proPer = (pro / total) * 100;
  const conPer = 100 - proPer;

  qs("sup-pro-bar").style.width = `${proPer}%`;
  qs("sup-con-bar").style.width = `${conPer}%`;
  qs("sup-pro-amount").innerText = "₩" + pro.toLocaleString();
  qs("sup-con-amount").innerText = "₩" + con.toLocaleString();
}

/* ==========================================================================
   6. 뒤로가기 / 스와이프
========================================================================== */
qs("btn-back").onclick = () => history.back();

let startX = 0;
document.addEventListener("touchstart", e => startX = e.touches[0].clientX);
document.addEventListener("touchend", e => {
  if (e.changedTouches[0].clientX - startX > 80) history.back();
});