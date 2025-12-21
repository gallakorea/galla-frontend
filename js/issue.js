console.log("[issue.js] loaded");

/* ==========================================================================
   0. Utils
========================================================================== */
function qs(id) {
  return document.getElementById(id);
}

let issueAuthorId = null;
let votingInProgress = false;

// ✅ 추가
let currentIssue = null;

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
  if (!window.supabaseClient) return;

  const supabase = window.supabaseClient;

  const { data: issue, error } = await supabase
    .from("issues")
    .select("*")
    .eq("id", issueId)
    .maybeSingle();

  if (error || !issue) {
    alert("이슈를 불러올 수 없습니다.");
    return;
  }

  renderIssue(issue);
  loadVoteStats(issue.id);   // 🔥 반드시 추가
  loadComments(issue.id);
  checkVoteStatus(issue.id);
  loadSupportStats(issue.id);
  loadMySupportStatus(issue.id);
  checkAuthorSupport(issue.id);
  checkRemixStatus(issue.id);
  loadRemixCounts(issue.id);
})();

/* ==========================================================================
   3. Render Issue
========================================================================== */
function renderIssue(issue) {
  currentIssue = issue;   // ✅ 이 줄 추가
  issueAuthorId = issue.user_id;

  qs("issue-category").innerText = issue.category || "";
  qs("issue-title").innerText = issue.title || "";
  qs("issue-desc").innerText = issue.one_line || "";

/* 핵심 요약 + Instagram 방식 더 보기 */
const explainWrap = qs("issue-explain-text");

if (explainWrap) {
  const textSpan = explainWrap.querySelector(".ig-text");
  const moreSpan = explainWrap.querySelector(".ig-more");

  if (textSpan) {
    textSpan.textContent = issue.description || "";
  }

  if (textSpan && moreSpan) {
    requestAnimationFrame(() => {
      // 🔥 클론으로 실제 전체 높이 측정
      const clone = textSpan.cloneNode(true);
      clone.style.position = "absolute";
      clone.style.visibility = "hidden";
      clone.style.webkitLineClamp = "unset";
      clone.style.maxHeight = "none";
      clone.style.pointerEvents = "none";

      explainWrap.appendChild(clone);

      const isOverflow =
        clone.scrollHeight > textSpan.clientHeight + 2;

      explainWrap.removeChild(clone);

      if (isOverflow) {
        explainWrap.classList.add("has-more");
      }
    });

    moreSpan.onclick = () => {
      explainWrap.classList.add("expanded");
    };
  }
}

  if (issue.created_at) {
    qs("issue-time").innerText =
      new Date(issue.created_at).toLocaleDateString();
  }

  qs("issue-author").innerText = "작성자 · 익명";

  /* 썸네일 */
  const thumb = qs("issue-thumb");
  if (thumb) {
    if (issue.thumbnail_url) {
      thumb.src = issue.thumbnail_url;
      thumb.style.display = "block";
    } else {
      thumb.style.display = "none";
    }
  }

  /* 영상 */
  const videoBtn = qs("open-video-modal");
  const videoEl = qs("speech-video");

  if (videoBtn && videoEl) {
    if (issue.video_url) {
      videoBtn.style.display = "block";
      videoEl.src = issue.video_url;
    } else {
      videoBtn.style.display = "none";
    }
  }
}

/* ==========================================================================
   Vote Stats (🔥 빠져 있던 핵심)
========================================================================== */
async function loadVoteStats(issueId) {
  const supabase = window.supabaseClient;

  const { data, error } = await supabase
    .from("votes")
    .select("type")
    .eq("issue_id", issueId);

  if (error) {
    console.error("vote stats error", error);
    return;
  }

  let pro = 0;
  let con = 0;

  data.forEach(v => {
    if (v.type === "pro") pro++;
    if (v.type === "con") con++;
  });

  const total = pro + con;

  const proPercent = total ? Math.round((pro / total) * 100) : 0;
  const conPercent = total ? 100 - proPercent : 0;

  // bar
  qs("vote-pro-bar").style.width = `${proPercent}%`;
  qs("vote-con-bar").style.width = `${conPercent}%`;

  // text
  qs("vote-pro-text").innerText = `${proPercent}%`;
  qs("vote-con-text").innerText = `${conPercent}%`;
}


/* ==========================================================================
   4. Vote
========================================================================== */
async function vote(type) {
  if (votingInProgress) return;
  votingInProgress = true;

  const supabase = window.supabaseClient;
  const { data: session } = await supabase.auth.getSession();

  if (!session.session) {
    alert("로그인이 필요합니다.");
    votingInProgress = false;
    return;
  }

  const { error } = await supabase.from("votes").insert({
    issue_id: issueId,
    user_id: session.session.user.id,
    type
  });

  votingInProgress = false;

  if (error && error.code !== "23505") {
    console.error(error);
    return;
  }

  // ✅ 1️⃣ 버튼 상태 갱신
  checkVoteStatus(issueId);

  // ✅ 2️⃣ 현황표 즉시 갱신 (🔥 이 줄이 핵심)
  loadVoteStats(issueId);
}

qs("btn-vote-pro")?.addEventListener("click", () => vote("pro"));
qs("btn-vote-con")?.addEventListener("click", () => vote("con"));

async function checkVoteStatus(issueId) {
  const supabase = window.supabaseClient;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return;

  const { data } = await supabase
    .from("votes")
    .select("type")
    .eq("issue_id", issueId)
    .eq("user_id", session.session.user.id)
    .maybeSingle();

  if (!data) return;

  const proBtn = qs("btn-vote-pro");
  const conBtn = qs("btn-vote-con");

  proBtn.disabled = true;
  conBtn.disabled = true;

  proBtn.classList.add("disabled");
  conBtn.classList.add("disabled");

  if (data.type === "pro") proBtn.innerText = "👍 투표 완료";
  else conBtn.innerText = "👎 투표 완료";

  qs("vote-status-text").innerText =
    data.type === "pro"
      ? "👍 찬성으로 투표하셨습니다."
      : "👎 반대로 투표하셨습니다.";
}

/* ==========================================================================
   Support Actions (Pro / Con)
========================================================================== */

async function support(stance, amount) {
  const supabase = window.supabaseClient;
  const { data: session } = await supabase.auth.getSession();

  if (!session.session) {
    alert("로그인이 필요합니다.");
    return;
  }

  const { error } = await supabase.from("supports").insert({
    issue_id: issueId,
    user_id: session.session.user.id,
    stance,
    amount
  });

  if (error) {
    console.error("support error", error);
    alert("후원에 실패했습니다.");
    return;
  }

  loadSupportStats(issueId);
  loadMySupportStatus(issueId);

  alert(
    stance === "pro"
      ? "👍 찬성 진영을 지원했습니다."
      : "👎 반대 진영을 지원했습니다."
  );
}

/* ==========================================================================
   5. Support
========================================================================== */
async function loadSupportStats(issueId) {
  const supabase = window.supabaseClient;
  const { data } = await supabase
    .from("supports")
    .select("stance, amount")
    .eq("issue_id", issueId);

  let pro = 0, con = 0;
  data?.forEach(s => {
    if (s.stance === "pro") pro += s.amount;
    if (s.stance === "con") con += s.amount;
  });

  const total = pro + con || 1;
  qs("sup-pro-bar").style.width = `${(pro / total) * 100}%`;
  qs("sup-con-bar").style.width = `${(con / total) * 100}%`;
  qs("sup-pro-amount").innerText = `₩${pro.toLocaleString()}`;
  qs("sup-con-amount").innerText = `₩${con.toLocaleString()}`;
}

async function loadMySupportStatus(issueId) {
  const supabase = window.supabaseClient;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return;

  const { data } = await supabase
    .from("supports")
    .select("stance, amount")
    .eq("issue_id", issueId)
    .eq("user_id", session.session.user.id);

  if (!data || data.length === 0) return;

  const total = data.reduce((s, v) => s + v.amount, 0);
  const stance = data[0].stance;

  qs("support-status-text").innerText =
    `${stance === "pro" ? "찬성" : "반대"} 진영에 ₩${total.toLocaleString()} 도움을 주셨습니다.`;
}

/* ==========================================================================
   6. Comments
========================================================================== */
async function loadComments(issueId) {
  const supabase = window.supabaseClient;
  const { data } = await supabase
    .from("comments")
    .select("*")
    .eq("issue_id", issueId)
    .eq("status", "normal")
    .order("created_at", { ascending: true });

  const root = qs("comment-list");
  root.innerHTML = "";

  data?.forEach(c => {
    const div = document.createElement("div");
    div.className = "comment-item";
    div.innerHTML = `
      <div class="comment-header"><span>익명</span></div>
      <div class="comment-text">${c.content}</div>
    `;
    root.appendChild(div);
  });
}

qs("main-reply-btn")?.addEventListener("click", async () => {
  const content = qs("main-reply").value.trim();
  if (!content) return;

  const supabase = window.supabaseClient;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return alert("로그인이 필요합니다.");

  await supabase.from("comments").insert({
    issue_id: issueId,
    user_id: session.session.user.id,
    content,
    status: "normal"
  });

  qs("main-reply").value = "";
  loadComments(issueId);
});

/* ==========================================================================
   7. Video Modal
========================================================================== */
const speechBackdrop = document.querySelector(".speech-backdrop");
const speechSheet = document.querySelector(".speech-sheet");

qs("open-video-modal")?.addEventListener("click", () => {
  speechBackdrop.hidden = false;
  setTimeout(() => (speechSheet.style.bottom = "0"), 10);
});

document.querySelector(".speech-close")?.addEventListener("click", () => {
  speechSheet.style.bottom = "-100%";
  setTimeout(() => (speechBackdrop.hidden = true), 300);
});

/* ==========================================================================
   8. Remix
========================================================================== */
async function checkRemixStatus(issueId) {
  const supabase = window.supabaseClient;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return;

  const { data } = await supabase
    .from("remixes")
    .select("remix_stance")
    .eq("issue_id", issueId)
    .eq("user_id", session.session.user.id)
    .maybeSingle();

  if (!data) return;

  applyRemixJoinedUI(data.remix_stance);
}

async function loadRemixCounts(issueId) {
  const supabase = window.supabaseClient;
  const { data } = await supabase
    .from("remixes")
    .select("remix_stance")
    .eq("issue_id", issueId);

  const pro = data?.filter(r => r.remix_stance === "pro").length || 0;
  const con = data?.filter(r => r.remix_stance === "con").length || 0;

  qs("remix-pro-count").innerText = `참전 ${pro} · 리믹스 ${pro}`;
  qs("remix-con-count").innerText = `참전 ${con} · 리믹스 ${con}`;
}

function applyRemixJoinedUI(stance) {
  qs("btn-remix-pro").disabled = true;
  qs("btn-remix-con").disabled = true;
}

qs("btn-remix-pro")?.addEventListener("click", () => goRemix("pro"));
qs("btn-remix-con")?.addEventListener("click", () => goRemix("con"));

function goRemix(stance) {
  if (!currentIssue) {
    alert("이슈 정보를 불러오지 못했습니다.");
    return;
  }

  sessionStorage.setItem(
    "remixContext",
    JSON.stringify({
      origin_issue_id: currentIssue.id,
      remix_stance: stance,
      category: currentIssue.category
    })
  );

  location.href = "write-remix.html";
}

/* ==========================================================================
   9. Back + Swipe
========================================================================== */
qs("btn-back")?.addEventListener("click", () => history.back());

let startX = 0;
document.addEventListener("touchstart", e => (startX = e.touches[0].clientX));
document.addEventListener("touchend", e => {
  if (e.changedTouches[0].clientX - startX > 80) history.back();
});

/* ==========================================================================
   10. Author Support
========================================================================== */
async function checkAuthorSupport(issueId) {
  const supabase = window.supabaseClient;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session || !issueAuthorId) return;

  const { data } = await supabase
    .from("author_supports")
    .select("id")
    .eq("issue_id", issueId)
    .eq("author_id", issueAuthorId)
    .eq("user_id", session.session.user.id)
    .maybeSingle();

  if (data) {
    const btn = qs("author-support-btn");
    btn.disabled = true;
    btn.innerText = "🔥 이미 응원했습니다";
  }
}

const supportModal = document.getElementById("support-modal");

/* 열기 */
document.getElementById("support-pro-btn")?.addEventListener("click", () => {
  console.log("support pro click");
  supportModal.removeAttribute("hidden");
});

document.getElementById("support-con-btn")?.addEventListener("click", () => {
  console.log("support con click");
  supportModal.removeAttribute("hidden");
});

/* 닫기 */
supportModal?.addEventListener("click", (e) => {
  if (e.target === supportModal || e.target.hasAttribute("data-close")) {
    supportModal.setAttribute("hidden", "");
  }
});

// 보탬 레벨 선택
document.querySelectorAll('.support-level').forEach(level => {
  level.addEventListener('click', () => {
    // 기존 active 제거
    document.querySelectorAll('.support-level.active')
      .forEach(el => el.classList.remove('active'));

    // 클릭한 항목 active
    level.classList.add('active');

    // 실행 버튼 활성화
    const confirmBtn = document.querySelector('.support-confirm');
    if (confirmBtn) confirmBtn.disabled = false;
  });
});