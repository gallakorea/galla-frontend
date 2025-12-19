console.log("[issue.js] loaded");

/* ==========================================================================
   0. Utils
========================================================================== */
function qs(id) {
  return document.getElementById(id);
}

/* 🔥 이 줄 추가 */
let issueAuthorId = null;

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
    .maybeSingle();

  if (error || !issue) {
    console.error(error);
    alert("이슈를 불러올 수 없습니다.");
    return;
  }

  renderIssue(issue);
  loadVotes(issue.id);
  loadComments(issue.id);
  checkRemixStatus(issue.id);
  loadRemixCounts(issue.id);
  checkVoteStatus(issue.id);
  loadSupportStats(issue.id);
  loadMySupportStatus(issue.id);
  checkAuthorSupport(issue.id); // 🔥 발의자 응원 상태 확인

})();

/* ==========================================================================
   3. Render Issue
========================================================================== */
function renderIssue(issue) {
  issueAuthorId = issue.user_id; // 🔥 이 줄 추가
  
  qs("issue-category").innerText = issue.category || "";
  qs("issue-title").innerText = issue.title || "";

  // ✅ 한 줄 요약
  qs("issue-desc").innerText = issue.summary || "";

  // ✅ 이슈 설명 (본문)
  qs("issue-explain-text").innerText = issue.description || "";
  
  if (issue.created_at) {
    qs("issue-time").innerText =
      new Date(issue.created_at).toLocaleDateString();
  }

  qs("issue-author").innerText = "작성자 · 익명";

  /* ==========================
    Thumbnail (🔥 FIX)
  ========================== */
  if (issue.thumbnail_url) {
    qs("issue-thumb").src = issue.thumbnail_url;
    qs("issue-thumb").style.display = "block";
  } else {
    qs("issue-thumb").style.display = "none";
  }

  /* ==========================
    Video (🔥 FIX)
  ========================== */
  if (issue.video_url) {
    qs("open-video-modal").style.display = "block";

    const videoEl = qs("speech-video");
    videoEl.src = issue.video_url;
    videoEl.controls = true;
  } else {
    qs("open-video-modal").style.display = "none";
  }

  renderVote(issue.pro_count || 0, issue.con_count || 0);
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
   5-1. Support Stats Load  👈 여기다 붙여라
========================================================================== */
async function loadSupportStats(issueId) {
  const supabase = window.supabaseClient;

  const { data, error } = await supabase
    .from("supports")
    .select("stance, amount")
    .eq("issue_id", issueId);

  if (error) {
    console.error("support load error", error);
    return;
  }

  let pro = 0;
  let con = 0;

  data.forEach(s => {
    if (s.stance === "pro") pro += s.amount;
    if (s.stance === "con") con += s.amount;
  });

  renderSupport(pro, con);
}

/* ==========================================================================
   5-1-1. My Support Status Text
========================================================================== */
function renderMySupportText(stance, amount) {
  const el = qs("my-support-status-text");
  if (!el) return;

  const label = stance === "pro" ? "찬성" : "반대";
  el.innerText =
    `${label} 진영에 ₩${amount.toLocaleString()} 후원으로 힘을 실어 주었습니다.`;
}

/* ==========================================================================
   5-1-2. My Support Status Load (누적)
========================================================================== */
async function loadMySupportStatus(issueId) {
  const supabase = window.supabaseClient;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return;

  const { data, error } = await supabase
    .from("supports")
    .select("stance, amount")
    .eq("issue_id", issueId)
    .eq("user_id", session.session.user.id);

  if (error || !data || data.length === 0) return;

  let total = 0;
  const stance = data[0].stance;

  data.forEach(s => {
    total += s.amount;
  });

  renderMySupportText(stance, total);
}

/* ==========================================================================
   5-2. Support Modal (TEMP)
========================================================================== */
qs("open-support-modal").onclick = () => {
  openSupportModal();
};

function openSupportModal() {
  const stance = confirm(
    "찬성 진영으로 후원할까요?\n취소하면 반대 진영입니다."
  )
    ? "pro"
    : "con";

  const amount = Number(prompt("후원 금액을 입력하세요 (원)"));
  if (!amount || amount <= 0) return;

  submitSupport(stance, amount);
}

/* ==========================================================================
   5-3. Support DB Insert
   👉 👇 여기
========================================================================== */
async function submitSupport(stance, amount) {
  const supabase = window.supabaseClient;
  const { data: session } = await supabase.auth.getSession();

  if (!session.session) {
    alert("로그인이 필요합니다.");
    return;
  }

  const { error } = await supabase
    .from("supports")
    .insert({
      issue_id: issueId,
      user_id: session.session.user.id,
      stance,
      amount
    });

  if (error) {
    console.error(error);
    alert("후원 실패");
    return;
  }

  // ✅ 즉시 UI 갱신
  loadSupportStats(issueId);
  loadMySupportStatus(issueId);   // ✅ 내 후원 문구 즉시 반영
}

/* ==========================================================================
   5-4. Author Support (발의자 응원)
========================================================================== */
async function checkAuthorSupport(issueId) {
  const supabase = window.supabaseClient;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return;

  if (!issueAuthorId) return; // 안전장치

  const { data } = await supabase
    .from("author_supports")
    .select("id")
    .eq("issue_id", issueId)
    .eq("author_id", issueAuthorId)
    .eq("user_id", session.session.user.id)
    .maybeSingle();

  if (data) {
    applyAuthorSupportDoneUI();
  }
}

function applyAuthorSupportDoneUI() {
  const btn = document.getElementById("author-support-btn");
  if (!btn) return;

  btn.disabled = true;
  btn.innerText = "🔥 이미 응원했습니다";
  btn.classList.add("disabled");
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
  checkVoteStatus(issueId); // ✅ 추가
}

qs("btn-vote-pro").onclick = () => vote("pro");
qs("btn-vote-con").onclick = () => vote("con");

/* ==========================================================================
   6-1. Vote Status Check (내 투표 여부)
========================================================================== */
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

  applyVoteDisabledUI(data.type);
}

function applyVoteDisabledUI(type) {
  const proBtn = qs("btn-vote-pro");
  const conBtn = qs("btn-vote-con");

  proBtn.classList.add("disabled");
  conBtn.classList.add("disabled");

  if (type === "pro") {
    proBtn.innerText = "👍 이미 찬성했습니다";
  } else {
    conBtn.innerText = "👎 이미 반대했습니다";
  }
}

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

/* ==========================================================================
   9-1. Remix Join Status Check
========================================================================== */
async function checkRemixStatus(issueId) {
  const supabase = window.supabaseClient;
  const { data: session } = await supabase.auth.getSession();

  if (!session.session) return; // 비로그인 → 무시

  const userId = session.session.user.id;

  const { data, error } = await supabase
    .from("remixes") // ⚠️ 실제 테이블명 확인
    .select("remix_stance")
    .eq("issue_id", issueId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return;

  applyRemixJoinedUI(data.remix_stance);
}

function applyRemixJoinedUI(stance) {
  if (document.querySelector(".remix-joined-text")) return;

  const proBtn = qs("btn-remix-pro");
  const conBtn = qs("btn-remix-con");
  const actionWrap = document.querySelector(".remix-actions");

  if (!proBtn || !conBtn || !actionWrap) return;

  proBtn.onclick = null;
  conBtn.onclick = null;

  proBtn.classList.add("disabled");
  conBtn.classList.add("disabled");

  actionWrap.insertAdjacentHTML(
    "afterend",
    stance === "pro"
      ? `<div class="remix-joined-text pro">
           이미 🔵 <strong>찬성 진영</strong>에 합류했습니다
         </div>`
      : `<div class="remix-joined-text con">
           이미 🔴 <strong>반대 진영</strong>에 합류했습니다
         </div>`
  );
}

/* ==========================================================================
   9-2. Remix Count Load
========================================================================== */
async function loadRemixCounts(issueId) {
  const supabase = window.supabaseClient;

  const { data, error } = await supabase
    .from("remixes")
    .select("remix_stance")
    .eq("issue_id", issueId);

  if (error) {
    console.error("remix count load error", error);
    return;
  }

  const proCount = data.filter(r => r.remix_stance === "pro").length;
  const conCount = data.filter(r => r.remix_stance === "con").length;

  const proEl = qs("remix-pro-count");
  const conEl = qs("remix-con-count");

  if (proEl) {
    proEl.innerText = `참전 ${proCount} · 리믹스 ${proCount}`;
  }

  if (conEl) {
    conEl.innerText = `참전 ${conCount} · 리믹스 ${conCount}`;
  }
}

/* ==========================================================================
   10. Remix / Battle (ACTIVE)
========================================================================== */

function goRemix(stance) {
  // stance: 'pro' | 'con'

  const remixContext = {
    origin_issue_id: issueId,
    remix_stance: stance,
    from: "issue"
  };

  // 🔥 세션에 저장 (write-remix에서 읽음)
  sessionStorage.setItem(
    "remixContext",
    JSON.stringify(remixContext)
  );

  // 🔥 리믹스 전용 작성 페이지로 이동
  location.href = "write-remix.html";
}

qs("btn-remix-pro").onclick = () => {
  goRemix("pro");
};

qs("btn-remix-con").onclick = () => {
  goRemix("con");
};

/* ==========================================================================
   11. Author Support Click → DB INSERT
========================================================================== */

document
  .getElementById("author-support-btn")
  ?.addEventListener("click", async () => {
    const supabase = window.supabaseClient;
    const { data: session } = await supabase.auth.getSession();

    if (!session.session) {
      alert("로그인이 필요합니다.");
      return;
    }

    if (!issueAuthorId) return;

    const { error } = await supabase
      .from("author_supports")
      .insert({
        issue_id: issueId,
        author_id: issueAuthorId,
        user_id: session.session.user.id
      });

    if (error) {
      console.error(error);

      if (error.code === "23505") {
        alert("이미 발의자를 응원했습니다.");
      } else {
        alert("응원 중 오류가 발생했습니다.");
      }
      return;
    }

    applyAuthorSupportDoneUI();
  });