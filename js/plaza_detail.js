import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://bidqauputnhkqepvdzrr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

// 🔥🔥🔥 여기다
window.supabase = supabase;

async function getSessionSafe() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/* =========================
   AUTH BUTTONS (LOGIN / SIGNUP / LOGOUT)
   ========================= */
document.addEventListener("DOMContentLoaded", async () => {
  const loginBtn = document.getElementById("loginBtn");
  const signupBtn = document.getElementById("signupBtn");

  // 🔑 현재 페이지 URL 저장
  const returnTo = encodeURIComponent(window.location.pathname + window.location.search);

  // 버튼 초기화 헬퍼
  function showLoggedOut() {
    if (loginBtn) {
      loginBtn.style.display = "inline-block";
      loginBtn.textContent = "로그인";
      loginBtn.onclick = () => {
        console.log("로그인 버튼 클릭");
        window.location.href = `login.html?returnTo=${returnTo}`;
      };
    }
    if (signupBtn) {
      signupBtn.style.display = "inline-block";
      signupBtn.textContent = "회원가입";
      signupBtn.onclick = () => {
        console.log("회원가입 버튼 클릭");
        window.location.href = `signup.html?returnTo=${returnTo}`;
      };
    }
  }

  function showLoggedIn() {
    if (loginBtn) {
      loginBtn.style.display = "inline-block";
      loginBtn.textContent = "로그아웃";
      loginBtn.onclick = async () => {
        console.log("로그아웃 클릭");
        await supabase.auth.signOut();
        showLoggedOut();
        window.location.reload();
      };
    }
    if (signupBtn) {
      signupBtn.style.display = "none";
    }
  }

  // 1) 최초 로드 시 세션 체크
  const session = await getSessionSafe();

  if (session) {
    showLoggedIn();
  } else {
    showLoggedOut();
  }

  // 2) 인증 상태 변화 감지
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      showLoggedIn();
    } else {
      showLoggedOut();
    }
  });
});

const postId = new URLSearchParams(location.search).get("id");

if (!postId) {
  alert("잘못된 접근입니다.");
  throw new Error("postId missing");
}

const commentList = document.getElementById("commentList");
const postTitleEl = document.querySelector(".post-title");
const postMetaEl = document.querySelector(".post-meta");
const postContentEl = document.querySelector(".post-content");

document.body.style.paddingBottom = "140px";

/*
comment = {
  id,
  parent_id: null | id,
  depth,
  nickname,
  body
}
*/

let comments = [];
let replyTarget = null; // { parentId, mentionName }
let myVote = 0; // 서버 기준으로 초기화됨

async function fetchPostDetail() {
  const { data, error } = await supabase
    .from("plaza_posts")
    .select("title, body, category, nickname")
    .eq("id", postId)
    .single();

  if (error) {
    console.error(error);
    return;
  }

  if (postTitleEl) postTitleEl.textContent = data.title;
  if (postContentEl) postContentEl.innerHTML = renderPostBody(data.body);
  if (postMetaEl) postMetaEl.textContent = `${data.nickname} · ${data.category}`;
}

async function fetchComments(commentCountEl) {
  const { data, error } = await supabase
    .from("plaza_comments")
    .select("id, parent_id, body, anon_name, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  comments = data.map(c => ({
    id: c.id,
    parent_id: c.parent_id,
    nickname: c.anon_name,
    body: c.body
  }));

  renderComments(comments);

  if (commentCountEl) {
    commentCountEl.textContent = comments.length;
  }
}

function renderComments(list) {
  if (!commentList) return;
  commentList.innerHTML = "";

  const roots = list.filter(c => c.parent_id === null);

  roots.forEach(root => {
    const rootLi = document.createElement("li");
    rootLi.className = "comment root";

    const replies = list.filter(r => r.parent_id === root.id);

    rootLi.innerHTML = `
      <div class="comment-meta">${root.nickname}</div>
      <div class="comment-body">${root.body}</div>

      <div class="comment-actions">
        <button class="reply-btn">답글 달기</button>
      </div>

      ${
        replies.length > 0
          ? `
            <div class="comment-actions">
              <button class="like-btn">👍</button>
              <button class="dislike-btn">👎</button>
              <button class="share-btn">공유</button>
              <button class="reply-btn">답글 달기</button>
            </div>
            <div class="reply-toggle-wrapper">
              ${replies.length > 0 ? `<button class="toggle-replies-btn">답글 ${replies.length}개 더보기</button>` : ""}
            </div>
          `
          : ``
      }
      <ul class="reply-list hidden"></ul>
    `;

    const replyBtn = rootLi.querySelector(".reply-btn");
    const toggleBtn = rootLi.querySelector(".toggle-replies-btn");
    const replyListEl = rootLi.querySelector(".reply-list");

    /* ===== 답글 달기 ===== */
    replyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      replyTarget = {
        parentId: root.id,
        mentionName: root.nickname
      };
      if (commentInput) {
        commentInput.value = `@${root.nickname} `;
        scrollToCommentInput();
        commentInput.focus();
      }
    });

    /* ===== 답글 더보기 / 접기 ===== */
    if (toggleBtn) {
      toggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();

        const isOpen = !replyListEl.classList.contains("hidden");

        if (isOpen) {
          replyListEl.classList.add("hidden");
          replyListEl.innerHTML = "";
          toggleBtn.textContent = `답글 ${replies.length}개 더보기`;
        } else {
          replyListEl.classList.remove("hidden");
          toggleBtn.textContent = "접기";
          renderReplies(replies, replyListEl);
        }
      });
    }

    commentList.appendChild(rootLi);
  });
}

function generateAnonNickname() {
  const a = ["웃픈", "화난", "졸린", "과몰입한"];
  const b = ["감자", "고양이", "직장인", "유령"];
  return `${a[Math.floor(Math.random()*a.length)]} ${b[Math.floor(Math.random()*b.length)]}`;
}

async function submitComment(body) {
  const anon_name = generateAnonNickname();

  const payload = {
    post_id: postId,
    body,
    anon_name,
    parent_id: replyTarget ? replyTarget.parentId : null
  };

  const { error } = await supabase
    .from("plaza_comments")
    .insert(payload);

  if (error) {
    alert("댓글 등록 실패");
    console.error(error);
    return;
  }

  replyTarget = null;
}

function scrollToCommentInput() {
  if (!commentInput) return;
  const rect = commentInput.getBoundingClientRect();
  window.scrollTo({
    top: window.scrollY + rect.top - 120,
    behavior: "smooth"
  });
}

function renderReplies(replies, container) {
  container.innerHTML = "";

  // ✅ 부모에서 내려오는 선 끊기 + 새 시작선
  container.style.marginLeft = "20px";
  container.style.paddingLeft = "16px";
  container.style.borderLeft = "1px solid rgba(255,255,255,0.12)";

  replies.forEach(reply => {
    const li = document.createElement("li");
    li.className = "comment reply";

    // ✅ 각 대댓글은 독립적으로 아래로 시작
    li.style.marginTop = "16px";

    li.innerHTML = `
      <div class="comment-meta">${reply.nickname}</div>
      <div class="comment-body">${reply.body}</div>
      <div class="comment-actions">
        <button class="like-btn">👍</button>
        <button class="dislike-btn">👎</button>
        <button class="share-btn">공유</button>
        <button class="reply-btn">답글 달기</button>
      </div>
    `;

    // ✅ 대댓글에서도 다시 답글 가능 (무한 싸움)
    li.querySelector(".reply-btn").addEventListener("click", () => {
      replyTarget = {
        parentId: reply.parent_id ?? reply.id,
        mentionName: reply.nickname
      };
      if (commentInput) {
        commentInput.value = `@${reply.nickname} `;
        scrollToCommentInput();
        commentInput.focus();
      }
    });

    container.appendChild(li);
  });
}

/* =========================
   POST BODY RENDERER
   - 줄바꿈 유지
   - [IMAGE]URL → 실제 이미지
========================= */
function renderPostBody(body) {
  if (!body) return "";

  return body
    // [IMAGE] 뒤의 URL (줄바꿈 포함) 처리
    .replace(
      /\[IMAGE\]([\s\S]*?)(?=\n|$)/g,
      (_, url) => {
        const cleanUrl = url.replace(/\s+/g, "");
        return `
          <div class="post-image-wrapper">
            <img src="${cleanUrl}" class="post-image" />
          </div>
        `;
      }
    )

    // 마지막에 줄바꿈 처리
    .replace(/\n/g, "<br>");
}

/* =========================
   PLAZA VOTE (UP / DOWN)
   - single score
   - up = +1, down = -1
========================= */

document.addEventListener("DOMContentLoaded", async () => {
  let voting = false; // 중복 클릭 방지
  let voteStateLoaded = false; // 🔒 내 투표 상태 로딩 완료 여부
  const voteScoreEl = document.getElementById("voteScore");
  const voteUpBtn = document.querySelector(".vote-up");
  const voteDownBtn = document.querySelector(".vote-down");

  const commentPill = document.querySelector(".comment-pill");
  const commentCountEl = document.getElementById("commentCount");
  const commentInput = document.getElementById("commentInput");
  const commentSubmitBtn = document.getElementById("commentSubmitBtn");

  // Helper function for vote state loading
  async function loadVoteState() {
    const session = await getSessionSafe();

    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/plaza-vote`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({ post_id: postId }),
        cache: "no-store",
      }
    );

    if (!res.ok) {
      console.error("vote state load failed", await res.text());
      return;
    }

    const data = await res.json();

    myVote = data.my_vote ?? 0;
    voteScoreEl.textContent = String(data.score ?? 0);

    if (voteUpBtn && voteDownBtn) {
      if (!session) {
        voteUpBtn.disabled = true;
        voteDownBtn.disabled = true;
        voteUpBtn.style.opacity = "0.3";
        voteDownBtn.style.opacity = "0.3";
        return;
      }

      // ✅ 항상 클릭 가능 (자유 전환)
      voteUpBtn.disabled = false;
      voteDownBtn.disabled = false;

      voteUpBtn.style.opacity = "1";
      voteDownBtn.style.opacity = "1";

      voteUpBtn.style.color = "#aaa";
      voteDownBtn.style.color = "#aaa";

      if (myVote === 1) {
        voteUpBtn.style.color = "#4da3ff";
      } else if (myVote === -1) {
        voteDownBtn.style.color = "#ff5c5c";
      }
    }
  }

  if (!voteScoreEl) {
    console.error("❌ voteScore element not found");
    return;
  }

  // 기본/비활성/활성 상태 분리
  [voteUpBtn, voteDownBtn].forEach(btn => {
    if (!btn) return;
    btn.style.color = "#aaa";        // 기본 비활성 톤
    btn.style.stroke = "#aaa";
    btn.style.fill = "none";
    btn.style.cursor = "pointer";
  });

  async function vote(voteValue) {
    if (voting) return;

    voting = true;

    const session = await getSessionSafe();
    if (!session) {
      console.error("No active session for voting");
      voting = false;
      return;
    }

    const { data, error } = await supabase.functions.invoke(
      "plaza-vote",
      {
        body: { post_id: postId, vote: voteValue },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      }
    );

    if (error) {
      console.error(error);
      alert("투표 처리 실패");
      voting = false;
      return;
    }

    // 서버가 내려준 값을 단일 진실로 사용
    myVote = typeof data?.my_vote === "number" ? data.my_vote : 0;

    if (typeof data?.score === "number") {
      voteScoreEl.textContent = String(data.score);
    }

    // 버튼 상태 갱신
    if (voteUpBtn && voteDownBtn) {
      voteUpBtn.disabled = false;
      voteDownBtn.disabled = false;

      voteUpBtn.style.opacity = "1";
      voteDownBtn.style.opacity = "1";
      voteUpBtn.style.color = "#aaa";
      voteUpBtn.style.stroke = "#aaa";
      voteDownBtn.style.color = "#aaa";
      voteDownBtn.style.stroke = "#aaa";

      if (myVote === 1) {
        voteUpBtn.style.color = "#4da3ff";
        voteUpBtn.style.stroke = "#4da3ff";
      } else if (myVote === -1) {
        voteDownBtn.style.color = "#ff5c5c";
        voteDownBtn.style.stroke = "#ff5c5c";
      }
    }

    voting = false;
  }

  voteUpBtn?.addEventListener("click", async e => {
    e.preventDefault();
    const session = await getSessionSafe();
    if (!session) {
      alert("로그인 후 투표할 수 있습니다.");
      return;
    }
    vote(1);
  });

  voteDownBtn?.addEventListener("click", async e => {
    e.preventDefault();
    const session = await getSessionSafe();
    if (!session) {
      alert("로그인 후 투표할 수 있습니다.");
      return;
    }
    vote(-1);
  });

  commentPill?.addEventListener("click", () => {
    commentInput?.scrollIntoView({ behavior: "smooth", block: "center" });
    commentInput?.focus();
  });

  commentSubmitBtn?.addEventListener("click", async () => {
    const body = commentInput.value.trim();
    if (!body) return alert("댓글을 입력하세요.");
    await submitComment(body);
    commentInput.value = "";
    fetchComments(commentCountEl);
  });

  await fetchPostDetail();

  // ✅ 페이지 진입 시 항상 1회 투표 상태 로딩 (로그인/비로그인 공통)
  await loadVoteState();

  // ✅ 이후 로그인/로그아웃 시에도 다시 동기화
supabase.auth.onAuthStateChange(async (event) => {
  if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
    await loadVoteState();
  }
});

  fetchComments(commentCountEl);
});