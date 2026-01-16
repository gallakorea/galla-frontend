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

async function fetchPostDetail() {
  const { data, error } = await supabase
    .from("plaza_posts")
    .select("title, body, category, nickname, created_at")
    .eq("id", postId)
    .single();

  if (error) {
    console.error(error);
    alert("글을 불러오지 못했습니다.");
    return;
  }

  postTitleEl.textContent = data.title;
  postContentEl.textContent = data.body;
  postMetaEl.textContent = `${data.nickname} · ${data.category} · 방금 전`;
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
}

function renderComments(list) {
  commentList.innerHTML = "";

  const roots = list.filter(c => c.parent_id === null);

  roots.forEach(root => {
    const rootLi = document.createElement("li");
    rootLi.className = "comment root";

    rootLi.innerHTML = `
      <div class="comment-meta">${root.nickname}</div>
      <div class="comment-body">${root.body}</div>
      <div class="comment-actions">
        <button class="toggle-replies-btn">답글 보기</button>
      </div>
      <ul class="reply-list hidden"></ul>
    `;

    const replyListEl = rootLi.querySelector(".reply-list");
    const toggleBtn = rootLi.querySelector(".toggle-replies-btn");

    const replies = list.filter(r => r.parent_id === root.id);

    toggleBtn.textContent = replies.length > 0
      ? `답글 ${replies.length}개 보기`
      : "답글 달기";

    toggleBtn.addEventListener("click", () => {
      const isHidden = replyListEl.classList.contains("hidden");

      if (isHidden) {
        // 열기
        replyListEl.classList.remove("hidden");
        toggleBtn.textContent = "접기";

        // 최초 1회만 렌더링
        if (!replyListEl.dataset.rendered) {
          renderReplies(replies, replyListEl, root);
          replyListEl.dataset.rendered = "true";
        }
      } else {
        // 접기
        replyListEl.classList.add("hidden");
        toggleBtn.textContent = replies.length > 0
          ? `답글 ${replies.length}개 보기`
          : "답글 달기";
      }
    });

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

function renderReplies(replies, container, rootComment) {
  container.innerHTML = "";

  replies.forEach(reply => {
    const li = document.createElement("li");
    li.className = "comment reply";

    li.innerHTML = `
      <div class="comment-meta">${reply.nickname}</div>
      <div class="comment-body">${reply.body}</div>
      <div class="comment-actions">
        <button class="reply-btn">답글</button>
      </div>
    `;

    li.querySelector(".reply-btn").addEventListener("click", () => {
      replyTarget = {
        parentId: rootComment.id,
        mentionName: reply.nickname
      };
      commentInput.value = `@${reply.nickname} `;
      scrollToCommentInput();
      commentInput.focus();
    });

    container.appendChild(li);
  });

  const writeLi = document.createElement("li");
  writeLi.className = "reply-write";

  writeLi.innerHTML = `
    <button class="reply-write-btn">답글 작성</button>
  `;

  writeLi.querySelector(".reply-write-btn").addEventListener("click", () => {
    replyTarget = {
      parentId: rootComment.id,
      mentionName: rootComment.nickname
    };
    commentInput.value = `@${rootComment.nickname} `;
    scrollToCommentInput();
    commentInput.focus();
  });

  container.appendChild(writeLi);
}
