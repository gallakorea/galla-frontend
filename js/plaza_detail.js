import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://bidqauputnhkqepvdzrr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const postId = new URLSearchParams(location.search).get("id");

if (!postId) {
  alert("잘못된 접근입니다.");
  throw new Error("postId missing");
}

const commentList = document.getElementById("commentList");
const postTitleEl = document.querySelector(".post-title");
const postMetaEl = document.querySelector(".post-meta");
const postContentEl = document.querySelector(".post-content");
const voteScoreEl = document.getElementById("voteCount");

const voteUpBtn = document.querySelector(".vote-up");
const voteDownBtn = document.querySelector(".vote-down");
const commentPill = document.querySelector(".pill:not(.vote-pill)");
const commentCountEl = commentPill ? commentPill.querySelector(".count") : null;

// 기본 색상: 흰색 강제
[voteUpBtn, voteDownBtn].forEach(btn => {
  if (btn) {
    btn.style.stroke = "#fff";
    btn.style.fill = "none";
    btn.style.color = "#fff";
    btn.style.pointerEvents = "auto";
    btn.style.cursor = "pointer";
  }
});

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

function scrollToCommentInput() {
  const rect = commentInput.getBoundingClientRect();
  window.scrollTo({
    top: window.scrollY + rect.top - 120,
    behavior: "smooth"
  });
}

if (commentPill) {
  commentPill.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    scrollToCommentInput();
    commentInput.focus();
  });
}

async function fetchPostDetail() {
  const { data, error } = await supabase
    .from("plaza_posts")
    .select("title, body, category, nickname, score")
    .eq("id", postId)
    .single();

  if (error) {
    console.error(error);
    return;
  }

  postTitleEl.textContent = data.title;
  postContentEl.innerHTML = renderPostBody(data.body);
  postMetaEl.textContent = `${data.nickname} · ${data.category}`;

  // 🔥 유일한 진실
  voteScoreEl.textContent =
    typeof data.score === "number" ? data.score : 0;
}

async function fetchComments() {
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
      commentInput.value = `@${root.nickname} `;
      scrollToCommentInput();
      commentInput.focus();
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

/* =========================
   COMMENT SUBMIT (ROOT)
========================= */


const commentInput = document.getElementById("commentInput");
const commentSubmitBtn = document.getElementById("commentSubmitBtn");

commentSubmitBtn.addEventListener("click", async () => {
  const body = commentInput.value.trim();
  if (!body) {
    alert("댓글을 입력하세요.");
    return;
  }

  await submitComment(body);

  replyTarget = null;
  commentInput.value = "";
  fetchComments();
});


fetchPostDetail();
fetchComments();

function renderReplies(replies, container) {
  container.innerHTML = "";

  // ✅ 부모에서 내려오는 선 끊기 + 새 시작선
  container.style.marginLeft = "20";
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
      commentInput.value = `@${reply.nickname} `;
      scrollToCommentInput();
      commentInput.focus();
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


async function vote(voteValue) {
  const current = parseInt(voteScoreEl.textContent || "0", 10);

  // optimistic UI
  voteScoreEl.textContent = current + voteValue;

  const { error } = await supabase.functions.invoke(
    "vote-plaza-post",
    {
      body: {
        post_id: postId,
        vote: voteValue, // 1 or -1
      },
    }
  );

  if (error) {
    console.error("vote error:", error);
    voteScoreEl.textContent = current; // rollback
    alert("투표 처리 중 오류가 발생했습니다.");
    return;
  }

  // single source of truth 재동기화
  await fetchPostDetail();
}

/* =========================
   VOTE BUTTON BINDING
========================= */

if (voteUpBtn) {
  voteUpBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    vote(1);
  });
}

if (voteDownBtn) {
  voteDownBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    vote(-1);
  });
}