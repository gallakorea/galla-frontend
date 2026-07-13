// 로컬 vendor UMD 전역 사용 (esm.sh 16모듈 폭포수 로드 제거)
const { createClient } = window.supabase;

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

/* 댓글 좋아요/싫어요 (이벤트 위임) */
commentList?.addEventListener("click", handleCommentVote);

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
let myVote = 0;          // 서버 기준
let lastRenderedVote = 0; // 🔥 UI 기준 마지막 투표 상태
let isVotingNow = false; // 🔥 투표 중 loadVoteState 차단

async function fetchPostDetail() {
  // 조회수 +1 (비동기, 실패 무시)
  supabase.rpc("increment_plaza_view", { p_post_id: postId }).then(() => {});

  const { data, error } = await supabase
    .from("plaza_posts")
    .select("id, user_id, title, body, category, nickname, view_count, created_at")
    .eq("id", postId)
    .single();

  if (error) {
    console.error(error);
    return;
  }

  if (postTitleEl) postTitleEl.textContent = data.title;
  if (postContentEl) postContentEl.innerHTML = renderPostBody(data.body);
  if (postMetaEl) {
    postMetaEl.textContent =
      `${data.nickname} · ${data.category} · 조회 ${(data.view_count || 0) + 1}`;
    if (data.user_id) postMetaEl.setAttribute("data-profile-uid", data.user_id);
  }
  // 작성자 팔로우 버튼 (post-meta 옆)
  if (data.user_id && postMetaEl && !document.getElementById("pz-follow")) {
    const fb = document.createElement("button");
    fb.id = "pz-follow"; fb.className = "js-follow pz-follow"; fb.dataset.uid = data.user_id;
    fb.textContent = "+ 팔로우";
    postMetaEl.parentNode.insertBefore(fb, postMetaEl.nextSibling);
  }

  // 소유자·관리자 전용 ⋯ 메뉴 (수정/삭제)
  const moreBtn = document.getElementById("header-more-btn");
  if (moreBtn) {
    moreBtn.style.display = "none";
    if (window.GALLA_canManage) {
      window.GALLA_canManage(data.user_id).then((can) => {
        if (!can) return;
        moreBtn.style.display = "";
        moreBtn.onclick = () =>
          window.GALLA_openOwnerMenu({
            table: "plaza_posts", id: data.id, ownerId: data.user_id, label: "광장 글",
            editFields: [
              { key: "title", label: "제목", type: "text", value: data.title || "" },
              { key: "body", label: "본문", type: "textarea", value: data.body || "" },
              { key: "category", label: "카테고리", type: "select", options: window.GALLA_CATEGORIES, value: data.category || "" },
            ],
            onSaved: (patch) => {
              if (patch.title != null && postTitleEl) postTitleEl.textContent = patch.title;
              if (patch.body != null && postContentEl) postContentEl.innerHTML = renderPostBody(patch.body);
            },
            onDeleted: () => { location.href = "plaza.html"; },
          });
      });
    }
  }
}

/* 내 댓글 투표 상태 (comment_id → 1|-1) */
let myCommentVotes = {};

async function fetchComments(commentCountEl) {
  const { data, error } = await supabase
    .from("plaza_comments")
    .select("id, parent_id, body, anon_name, created_at, like_count, dislike_count, user_id")
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
    body: c.body,
    created_at: c.created_at,
    like_count: c.like_count || 0,
    dislike_count: c.dislike_count || 0,
    user_id: c.user_id
  }));

  // 로그인 상태면 내 투표 불러와 하이라이트
  myCommentVotes = {};
  const session = await getSessionSafe();
  window.__PLAZA_MY_UID = session?.user?.id || null;
  if (session?.user && comments.length) {
    const { data: votes } = await supabase
      .from("plaza_comment_votes")
      .select("comment_id, value")
      .in("comment_id", comments.map(c => c.id));
    (votes || []).forEach(v => { myCommentVotes[v.comment_id] = v.value; });
  }

  renderComments(comments);

  if (commentCountEl) {
    commentCountEl.textContent = comments.length;
  }
}

/* 상대 시간 */
function timeAgoK(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "방금 전";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

/* 댓글 헤더 + 투표 버튼 HTML */
function commentVoteHtml(c) {
  const my = myCommentVotes[c.id];
  return `
    <button class="cv-btn cv-like ${my === 1 ? "on" : ""}" data-cid="${c.id}" data-v="1">👍 <span>${c.like_count}</span></button>
    <button class="cv-btn cv-dislike ${my === -1 ? "on" : ""}" data-cid="${c.id}" data-v="-1">👎 <span>${c.dislike_count}</span></button>`;
}
function commentHeaderHtml(c) {
  const mine = c.user_id && c.user_id === window.__PLAZA_MY_UID;
  const menu = mine
    ? `<button class="cmt-mini" data-cmt-menu data-cmt-table="plaza_comments" data-cmt-id="${c.id}" data-cmt-uid="${c.user_id}" data-cmt-bodycol="body" aria-label="더보기">⋯</button>`
    : "";
  return `<div class="comment-meta"><span class="cm-nick">${c.nickname || "익명"}</span><span class="cm-time">${timeAgoK(c.created_at)}</span>${menu}</div>`;
}

/* 투표 처리 (이벤트 위임) */
async function handleCommentVote(e) {
  const btn = e.target.closest(".cv-btn");
  if (!btn) return false;
  e.stopPropagation();

  const session = await getSessionSafe();
  if (!session?.user) {
    if (confirm("로그인이 필요합니다. 로그인하시겠어요?")) location.href = "login.html";
    return true;
  }

  const cid = btn.dataset.cid;
  const val = Number(btn.dataset.v);
  const { data, error } = await supabase.rpc("vote_plaza_comment", {
    p_comment_id: cid, p_value: val
  });
  if (error) { console.error(error); alert("투표 실패"); return true; }

  const row = Array.isArray(data) ? data[0] : data;
  if (row) {
    if (row.my_vote === null || row.my_vote === undefined) delete myCommentVotes[cid];
    else myCommentVotes[cid] = row.my_vote;
    // 해당 댓글의 두 버튼 갱신
    document.querySelectorAll(`.cv-btn[data-cid="${cid}"]`).forEach(b => {
      const v = Number(b.dataset.v);
      b.querySelector("span").textContent = v === 1 ? row.like_count : row.dislike_count;
      b.classList.toggle("on", myCommentVotes[cid] === v);
    });
  }
  return true;
}

function renderComments(list) {
  if (!commentList) return;
  commentList.innerHTML = "";

  const roots = list.filter(c => c.parent_id === null);

  roots.forEach(root => {
    const rootLi = document.createElement("li");
    rootLi.className = "comment root"; rootLi.setAttribute("data-cmt-item","");

    const replies = list.filter(r => r.parent_id === root.id);

    rootLi.innerHTML = `
      ${commentHeaderHtml(root)}
      <div class="comment-body" data-cmt-text>${root.body}</div>

      <div class="comment-actions">
        ${commentVoteHtml(root)}
        <button class="reply-btn">답글 달기</button>
      </div>

      ${
        replies.length > 0
          ? `<div class="reply-toggle-wrapper">
              <button class="toggle-replies-btn">답글 ${replies.length}개 더보기</button>
            </div>`
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
  // 정통망법 대비: 댓글도 무조건 로그인(작성자 기록). 익명은 표시만.
  const session = await getSessionSafe();
  const user = session?.user || null;
  if (!user) {
    if (confirm("댓글을 쓰려면 로그인이 필요합니다. 로그인하시겠어요?")) {
      location.href = "login.html";
    }
    return;
  }

  // 표시 이름: 익명 체크 시 랜덤 익명, 기본은 내 닉네임
  const anonChecked = document.getElementById("comment-anon")?.checked === true;
  let displayName = generateAnonNickname();
  if (!anonChecked) {
    const { data: prof } = await supabase
      .from("user_profiles")
      .select("nickname")
      .eq("user_id", user.id)
      .maybeSingle();
    displayName = prof?.nickname || displayName;
  }

  const payload = {
    post_id: postId,
    body,
    anon_name: displayName,
    user_id: user.id,
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
    li.className = "comment reply"; li.setAttribute("data-cmt-item","");

    // ✅ 각 대댓글은 독립적으로 아래로 시작
    li.style.marginTop = "16px";

    li.innerHTML = `
      ${commentHeaderHtml(reply)}
      <div class="comment-body" data-cmt-text>${reply.body}</div>
      <div class="comment-actions">
        ${commentVoteHtml(reply)}
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
   - 공용 렌더러(plaza-render.js) 사용: 이미지/동영상/임베드 + 라이트 마크다운(XSS-safe)
   - 구버전 폴백: 렌더러 미로드 시 [IMAGE]만 처리
========================= */
function renderPostBody(body) {
  if (!body) return "";
  if (window.GALLA_renderPlazaBody) return window.GALLA_renderPlazaBody(body);
  return body
    .replace(/\[IMAGE\]([\s\S]*?)(?=\n|$)/g, (_, url) =>
      `<div class="post-image-wrapper"><img src="${url.replace(/\s+/g, "")}" class="post-image" /></div>`)
    .replace(/\n/g, "<br>");
}

/* =========================
   PLAZA VOTE (UP / DOWN)
   - single score
   - up = +1, down = -1
========================= */

document.addEventListener("DOMContentLoaded", async () => {
  let voting = false; // 중복 클릭 방지
  const voteScoreEl = document.getElementById("voteScore");
  const voteUpBtn = document.querySelector(".vote-up");
  const voteDownBtn = document.querySelector(".vote-down");

  const commentPill = document.querySelector(".comment-pill");
  const commentCountEl = document.getElementById("commentCount");
  const commentInput = document.getElementById("commentInput");
  const commentSubmitBtn = document.getElementById("commentSubmitBtn");

  // Helper function for vote state loading (PostgREST 직접 조회, 엣지함수 JWT 이슈 회피)
  async function loadVoteState() {
    if (isVotingNow) return; // 🔒 투표 중에는 서버 동기화로 UI 덮어쓰기 금지

    const session = await getSessionSafe();

    const { data: post } = await supabase
      .from("plaza_posts").select("score").eq("id", postId).maybeSingle();
    let mv = 0;
    if (session?.user) {
      const { data: v } = await supabase
        .from("plaza_votes").select("vote")
        .eq("post_id", postId).eq("user_id", session.user.id).maybeSingle();
      mv = v?.vote ?? 0;
    }

    const data = { score: post?.score ?? 0, my_vote: mv };

    myVote = data.my_vote ?? 0;
    lastRenderedVote = myVote;
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

  function updateVoteUI() {
    if (!voteUpBtn || !voteDownBtn) return;

    voteUpBtn.style.color = "#aaa";
    voteDownBtn.style.color = "#aaa";

    if (myVote === 1) {
      voteUpBtn.style.color = "#4da3ff";
    } else if (myVote === -1) {
      voteDownBtn.style.color = "#ff5c5c";
    }
  }

  async function vote(voteValue) {
    if (voting) return;

    voting = true;
    isVotingNow = true;

    // 🔥 즉시 UI 반영 (중립 0 제거 핵심 로직)
    const prev = lastRenderedVote;
    const next = voteValue;

    // 점수 즉시 계산
    let delta = 0;
    if (prev === 1 && next === -1) delta = -2;
    else if (prev === -1 && next === 1) delta = 2;
    else if (prev === 0 && next === 1) delta = 1;
    else if (prev === 0 && next === -1) delta = -1;

    const currentScore = parseInt(voteScoreEl.textContent, 10) || 0;
    voteScoreEl.textContent = String(currentScore + delta);

    // UI 상태 즉시 변경
    lastRenderedVote = next;
    myVote = next;
    updateVoteUI();

    try {
      const session = await getSessionSafe();
      if (!session) {
        alert("로그인 후 투표할 수 있습니다.");
        return;
      }

      const { data: rows, error } = await supabase.rpc("vote_plaza_post", {
        p_post_id: postId, p_value: voteValue
      });

      if (error) {
        console.error(error);
        alert("투표 처리 실패");
        return;
      }

      const data = Array.isArray(rows) ? rows[0] : rows;
      // 서버 값으로 최종 보정
      if (typeof data?.score === "number") {
        voteScoreEl.textContent = String(data.score);
      }
      myVote = data?.my_vote ?? myVote;
      lastRenderedVote = myVote;
      updateVoteUI();

    } finally {
      voting = false;
      isVotingNow = false;
    }
  }

  voteUpBtn?.addEventListener("click", async e => {
    e.preventDefault();
    const session = await getSessionSafe();
    if (!session) {
      alert("로그인 후 투표할 수 있습니다.");
      return;
    }

    // 🔥 항상 업은 +1로 즉시 전환
    await vote(1);
  });

  voteDownBtn?.addEventListener("click", async e => {
    e.preventDefault();
    const session = await getSessionSafe();
    if (!session) {
      alert("로그인 후 투표할 수 있습니다.");
      return;
    }

    // 🔥 항상 다운은 -1로 즉시 전환
    await vote(-1);
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
/* =========================
   글 저장(북마크) — 로그인 필수
========================= */
(async function initPlazaBookmark() {
  const btn = document.getElementById("plazaBookmarkBtn");
  if (!btn || !postId) return;

  let saved = false;

  const paint = () => btn.classList.toggle("on", saved);

  const session = await getSessionSafe();
  if (session?.user) {
    const { data } = await supabase
      .from("plaza_bookmarks")
      .select("post_id")
      .eq("post_id", postId)
      .eq("user_id", session.user.id)
      .maybeSingle();
    saved = !!data;
    paint();
  }

  btn.addEventListener("click", async () => {
    const s = await getSessionSafe();
    if (!s?.user) {
      if (confirm("저장하려면 로그인이 필요합니다. 로그인하시겠어요?")) location.href = "login.html";
      return;
    }
    btn.disabled = true;
    try {
      if (saved) {
        await supabase.from("plaza_bookmarks").delete()
          .eq("post_id", postId).eq("user_id", s.user.id);
      } else {
        await supabase.from("plaza_bookmarks").insert({ post_id: postId, user_id: s.user.id });
      }
      saved = !saved;
      paint();
    } finally {
      btn.disabled = false;
    }
  });

  // 공유 — 인덱스와 동일: /share/plaza/<id> OG URL + 공용 공유 시트(배너 미리보기)
  document.querySelector(".share-btn")?.addEventListener("click", () => {
    const url = window.GALLA_shareUrl ? window.GALLA_shareUrl("plaza", postId) : location.href;
    const title = postTitleEl && postTitleEl.textContent ? `💬 ${postTitleEl.textContent}` : "GALLA 광장";
    if (window.GALLA_share) return window.GALLA_share({ url, title, text: "갈라 광장에서 지금 뜨거운 이야기" });
    if (navigator.share) { navigator.share({ title, url }).catch(() => {}); return; }
    navigator.clipboard?.writeText(url).then(() => alert("링크가 복사되었습니다."));
  });
})();
