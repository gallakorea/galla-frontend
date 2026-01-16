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

  commentList.innerHTML = "";
  renderComments(comments);
}

function renderComments(list, parentId = null, containerEl = commentList, depth = 0) {
  const children = list.filter(c => c.parent_id === parentId);
  if (children.length === 0) return;

  const ul = document.createElement("ul");
  ul.className = parentId ? "comment-children" : "comment-root";

  children.forEach(c => {
    const li = document.createElement("li");
    li.className = `comment depth-${depth}`;

    const content = document.createElement("div");
    content.className = "comment-content";

    const meta = document.createElement("div");
    meta.className = "comment-meta";
    meta.textContent = c.nickname;

    const body = document.createElement("div");
    body.className = "comment-body";
    body.textContent = c.body;

    const actions = document.createElement("div");
    actions.className = "comment-actions";

    const replyBtn = document.createElement("button");
    replyBtn.textContent = "답글";
    replyBtn.addEventListener("click", () => replyTo(c.id));

    actions.appendChild(replyBtn);

    content.appendChild(meta);
    content.appendChild(body);
    content.appendChild(actions);
    li.appendChild(content);

    // 재귀적으로 자식 댓글 렌더링
    renderComments(list, c.id, li, depth + 1);

    ul.appendChild(li);
  });

  containerEl.appendChild(ul);
}

async function replyTo(parentId) {
  const body = prompt("답글을 입력하세요");
  if (!body) return;

  const anon_name = generateAnonNickname();

  const { error } = await supabase
    .from("plaza_comments")
    .insert({
      post_id: postId,
      parent_id: parentId,
      body,
      anon_name
    });

  if (error) {
    alert("댓글 등록 실패");
    console.error(error);
    return;
  }

  fetchComments();
}
window.replyTo = replyTo;

function generateAnonNickname() {
  const a = ["웃픈", "화난", "졸린", "과몰입한"];
  const b = ["감자", "고양이", "직장인", "유령"];
  return `${a[Math.floor(Math.random()*a.length)]} ${b[Math.floor(Math.random()*b.length)]}`;
}

async function submitRootComment(body) {
  if (!body) return;

  const anon_name = generateAnonNickname();

  const { error } = await supabase
    .from("plaza_comments")
    .insert({
      post_id: postId,
      parent_id: null,
      body,
      anon_name
    });

  if (error) {
    alert("댓글 등록 실패");
    console.error(error);
    return;
  }

  fetchComments();
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

  await submitRootComment(body);

  // 성공 처리
  commentInput.value = "";
  fetchComments();
});


fetchPostDetail();
fetchComments();