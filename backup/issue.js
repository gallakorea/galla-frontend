console.log("[issue.js] loaded");

/* ==========================================================================
   0. Utils
========================================================================== */
function qs(id) {
  return document.getElementById(id);
}

/* ==========================================================================
   1. URL → issue id
========================================================================== */
const params = new URLSearchParams(location.search);
const issueId = params.get("id");

if (!issueId) {
  alert("잘못된 접근입니다.");
  location.href = "index.html";
}

/* ==========================================================================
   2. Load Issue
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
  loadVotes(issue.id);
  loadComments(issue.id);
})();

/* ==========================================================================
   3. Render Issue
========================================================================== */
function renderIssue(issue) {
  qs("issue-category").innerText = issue.category || "";
  qs("issue-title").innerText = issue.title || "";
  qs("issue-desc").innerText = issue.description || "";

  if (issue.created_at) {
    qs("issue-time").innerText =
      new Date(issue.created_at).toLocaleDateString();
  }

  qs("issue-author").innerText = "작성자 · 익명";

  /* Thumbnail */
  if (issue.thumbnail_url) {
    const { data } = window.supabaseClient
      .storage
      .from("issues")
      .getPublicUrl(issue.thumbnail_url);

    qs("issue-thumb").src = data.publicUrl;
  }

  /* Video */
  if (issue.video_url) {
    qs("open-video-modal").style.display = "block";

    const { data } = window.supabaseClient
      .storage
      .from("issues")
      .getPublicUrl(issue.video_url);

    const videoEl = qs("speech-video");
    videoEl.src = data.publicUrl;
    videoEl.controls = true;
  } else {
    qs("open-video-modal").style.display = "none";
  }

  renderVote(issue.pro_count || 0, issue.con_count || 0);
  renderSupport(issue.sup_pro || 0, issue.sup_con || 0);
}

/* ==========================================================================
   4. Vote UI
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
   5. Support UI
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
   6. Voting (votes table 기준)
   - votes 테이블 컬럼: issue_id, user_id, type ('pro' | 'con')
   - Unique(issue_id, user_id)
========================================================================== */
async function loadVotes(issueId) {
  const supabase = window.supabaseClient;

  const { data, error } = await supabase
    .from("votes")
    .select("type")
    .eq("issue_id", issueId);

  if (error) {
    console.error("vote load error", error);
    return;
  }

  const pro = data.filter(v => v.type === "pro").length;
  const con = data.filter(v => v.type === "con").length;

  renderVote(pro, con);
}

async function vote(type) {
  const supabase = window.supabaseClient;
  const { data: session } = await supabase.auth.getSession();

  if (!session.session) {
    alert("로그인이 필요합니다.");
    return;
  }

  const userId = session.session.user.id;

  const { error } = await supabase
    .from("votes")
    .upsert(
      {
        issue_id: issueId,
        user_id: userId,
        type: type
      },
      { onConflict: "issue_id,user_id" }
    );

  if (error) {
    console.error(error);
    alert("투표 처리 중 오류가 발생했습니다.");
    return;
  }

  loadVotes(issueId);
}

qs("btn-vote-pro").onclick = () => vote("pro");
qs("btn-vote-con").onclick = () => vote("con");

/* ==========================================================================
   7. Comments
========================================================================== */
async function loadComments(issueId) {
  const supabase = window.supabaseClient;

  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("issue_id", issueId)
    .eq("status", "normal")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("comment load error", error);
    return;
  }

  renderComments(data);
}

function renderComments(comments) {
  const root = qs("comment-list");
  root.innerHTML = "";

  comments.forEach(c => {
    const div = document.createElement("div");
    div.className = "comment-item";

    div.innerHTML = `
      <div class="comment-header">
        <span class="comment-author">익명</span>
      </div>
      <div class="comment-text">${c.content}</div>
    `;

    root.appendChild(div);
  });
}

qs("main-reply-btn").onclick = async () => {
  const content = qs("main-reply").value.trim();
  if (!content) return;

  const supabase = window.supabaseClient;
  const { data: session } = await supabase.auth.getSession();

  if (!session.session) {
    alert("로그인이 필요합니다.");
    return;
  }

  const { error } = await supabase
    .from("comments")
    .insert({
      issue_id: issueId,
      user_id: session.session.user.id,
      content: content,
      status: "normal"
    });

  if (error) {
    console.error(error);
    alert("댓글 등록 실패");
    return;
  }

  qs("main-reply").value = "";
  loadComments(issueId);
};

/* ==========================================================================
   8. Video Modal
========================================================================== */
const speechBackdrop = document.querySelector(".speech-backdrop");
const speechSheet = document.querySelector(".speech-sheet");

qs("open-video-modal").onclick = () => {
  speechBackdrop.hidden = false;
  setTimeout(() => speechSheet.style.bottom = "0", 10);
};

document.querySelector(".speech-close").onclick = () => {
  speechSheet.style.bottom = "-100%";
  setTimeout(() => speechBackdrop.hidden = true, 300);
};

/* ==========================================================================
   9. Back / Swipe
========================================================================== */
qs("btn-back").onclick = () => history.back();

let startX = 0;
document.addEventListener("touchstart", e => {
  startX = e.touches[0].clientX;
});
document.addEventListener("touchend", e => {
  if (e.changedTouches[0].clientX - startX > 80) history.back();
});