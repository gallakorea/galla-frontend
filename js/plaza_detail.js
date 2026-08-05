// 로컬 vendor UMD 전역 사용 (esm.sh 16모듈 폭포수 로드 제거)
/* ═══ 이중 모드(MPA/SPA) ═══
   · MPA(plaza_detail.html 단독 문서): 파일 하단에서 기존처럼 자동 초기화(+자체 클라이언트 생성).
   · SPA(app.html, body[data-page="spa"]): 자동 초기화를 건너뛰고
     window.GALLA_PAGE_PLAZA_DETAIL.mount(root, params)를 어댑터(js/spa/views/plaza_detail.js)가 호출.
     클라이언트는 셸의 window.supabaseClient를 재사용(중복 GoTrue 인스턴스 방지),
     요소 조회는 root(D) 스코프, id는 params에서 읽는다. */

// 광장 글 카테고리 어휘(search.html #plaza-category와 동일) — 수정 모달 드롭다운용.
// owner-actions의 복합형 GALLA_CATEGORIES('정치·사회')와 달라 별도 정의한다.
const PLAZA_CATEGORIES = ["정치","사회","경제","투자","직장","연애","결혼","일상","패션·뷰티","엔터","스포츠","여행","맛집","19금","기타"];

const SUPABASE_URL = "https://bidqauputnhkqepvdzrr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";

let supabase = null;

// 조회 루트 — MPA면 document, SPA면 view-host(#app 추출분)
let D = document;
const byId = (id) => (D === document) ? document.getElementById(id) : D.querySelector("#" + id);

// 세션 조회 메모이즈 — 로드 중 10번 넘게 부르던 auth.getSession()(토큰 갱신 시 네트워크)을
// 1회로 합쳐 광장 상세 로드를 빠르게(사장님 제보). 로그인/로그아웃 시엔 캐시를 비운다.
let _sessP = null;
async function getSessionSafe() {
  if (!_sessP) _sessP = supabase.auth.getSession().then(r => r.data.session).catch(() => null);
  return _sessP;
}

/* auth 리스너 등록 — SPA unmount 때 해제할 수 있게 구독을 모아둔다 */
const _authSubs = [];
function onAuth(cb) {
  try {
    const { data } = supabase.auth.onAuthStateChange(cb);
    if (data && data.subscription) _authSubs.push(data.subscription);
  } catch (_) {}
}

/* =========================
   AUTH BUTTONS (LOGIN / SIGNUP / LOGOUT)
   ========================= */
async function initAuthButtons() {
  const loginBtn = byId("loginBtn");
  const signupBtn = byId("signupBtn");

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
  onAuth((_event, session) => {
    if (session) {
      showLoggedIn();
    } else {
      showLoggedOut();
    }
  });
}

let postId = null;

let commentList = null;
let postTitleEl = null;
let postMetaEl = null;
let postContentEl = null;
let commentInput = null;

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

/* 작성자 블록 — 아바타·등급·활동명(탭=팝오버)·팔로우·응원. 봇 수집글(user_id null)은 닉네임만 */
async function renderAuthorBlock(data) {
  if (!postMetaEl || byId("pz-author")) return;
  const wrap = document.createElement("div");
  wrap.id = "pz-author"; wrap.className = "pz-author";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  if (data.user_id) {
    if (window.GALLA_userMap) await window.GALLA_userMap([data.user_id]);
    const u = (window.__GU_CACHE || {})[data.user_id] || {};
    const nick = u.nickname || data.nickname || "갈라이안";
    const av = u.avatar_url
      ? `<img src="${esc(window.GALLA_avatarSrc ? window.GALLA_avatarSrc(u.avatar_url) : u.avatar_url)}" alt="" onerror="this.style.display='none'">`
      : `<span class="pza-init">${esc(nick.trim().charAt(0) || "갈")}</span>`;
    wrap.innerHTML = `
      <span class="pza-av" data-user-id="${esc(data.user_id)}" data-user-nick="${esc(nick)}">${av}</span>
      <span class="pza-info">
        <span class="pza-name" data-user-id="${esc(data.user_id)}" data-nick-uid="${esc(data.user_id)}" data-user-nick="${esc(nick)}">${esc(nick)}</span>
        <span class="pza-sub">광장 작성자</span>
      </span>
      <button type="button" class="js-follow pza-follow" data-uid="${esc(data.user_id)}">+ 팔로우</button>
      <button type="button" class="pza-cheer" id="pzCheer">💝 응원하기</button>`;
  } else {
    // 봇/수집 글 — 표시용 닉네임만 (팔로우·응원 불가)
    wrap.innerHTML = `
      <span class="pza-av"><span class="pza-init">${esc([...(data.nickname || "갈").trim()][0] || "갈")}</span></span>
      <span class="pza-info">
        <span class="pza-name">${esc(data.nickname || "광장 요정")}</span>
        <span class="pza-sub">커뮤 소식 수집글</span>
      </span>`;
  }
  postMetaEl.parentNode.insertBefore(wrap, postMetaEl);
  window.GALLA_bindFollow && window.GALLA_bindFollow(wrap);
  const cheer = wrap.querySelector("#pzCheer");
  if (cheer) cheer.addEventListener("click", () => {
    const nick = wrap.querySelector(".pza-name")?.dataset.userNick || "작성자";
    if (window.openDonatePlaza) window.openDonatePlaza(data.id, nick);
  });
}

/* 응원(슈퍼챗) 스트립 — 후원이 있으면 본문 아래 표시해 후원 촉진 */
window.GALLA_renderPlazaDonations = async function (postId) {
  try {
    const { data } = await supabase.rpc("plaza_donations", { p_post_id: postId, p_limit: 10 });
    let box = byId("pz-donates");
    if (!data?.ok || !data.count) { box?.remove(); return; }
    if (!box) {
      box = document.createElement("div");
      box.id = "pz-donates"; box.className = "pz-donates";
      D.querySelector(".plaza-post .post-inner")?.appendChild(box);
    }
    const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    box.innerHTML = `<div class="pzd-head">💝 응원 <b>${data.count}</b> · 총 <b>${(data.total || 0).toLocaleString()}원</b></div>
      <div class="pzd-list">${(data.rows || []).slice(0, 5).map(r =>
        `<div class="pzd-row"><b>${esc(r.name)}</b> ${(r.amount || 0).toLocaleString()}원${r.message ? ` · <span>${esc(r.message)}</span>` : ""}</div>`).join("")}</div>`;
  } catch (_) {}
};

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
  // 🤖 갈비스 — 이 글 맥락 채우기
  { const gb = D.querySelector("#plazaGalvisBtn"); if (gb) { gb.setAttribute("data-gv-id", String(postId || "")); gb.setAttribute("data-gv-title", data.title || ""); } }
  if (postMetaEl) {
    postMetaEl.textContent = `${data.category} · 조회 ${(data.view_count || 0) + 1}`;
  }
  // 작성자 블록 (이슈 상세와 동일 급): 아바타 + 등급 + 활동명 + 팔로우 + 💝응원
  renderAuthorBlock(data);
  // 응원(슈퍼챗) 스트립
  window.GALLA_renderPlazaDonations && window.GALLA_renderPlazaDonations(data.id);

  // 소유자·관리자 전용 ⋯ 메뉴 (수정/삭제) — SPA에선 페이지 헤더가 셸 크롬으로 제거돼 없을 수 있다
  const moreBtn = byId("header-more-btn");
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
              { key: "category", label: "카테고리", type: "select", options: PLAZA_CATEGORIES, value: data.category || "" },
            ],
            onSaved: (patch) => {
              if (patch.title != null && postTitleEl) postTitleEl.textContent = patch.title;
              if (patch.body != null && postContentEl) postContentEl.innerHTML = renderPostBody(patch.body);
            },
            onDeleted: () => { (window.GALLA_nav||function(u){location.href=u})("search.html?tab=plaza"); },
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
    .select("id, parent_id, body, anon_name, created_at, like_count, dislike_count, user_id:author_id, is_anonymous, ghost_seed")
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
    user_id: c.user_id,
    is_anonymous: c.is_anonymous,
    ghost_seed: c.ghost_seed
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

  // 작성자 프로필(아바타·닉·레벨) 프리페치 — 유령 댓글 제외
  if (window.GALLA_userMap) {
    await window.GALLA_userMap(comments.filter(c => !c.is_anonymous).map(c => c.user_id));
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
  // ⋯ 메뉴는 항상 노출 — comment-actions가 내 것/관리자엔 수정·삭제, 남의 것엔 신고를 자동 분기.
  //   (예전엔 '내 댓글'에만 떠서 광장엔 수정·삭제 진입이 없던 문제 — 사장님 제보)
  const menu = c.user_id
    ? `<button class="cmt-mini" data-cmt-menu data-cmt-table="plaza_comments" data-cmt-id="${c.id}" data-cmt-uid="${c.user_id}" data-cmt-bodycol="body" aria-label="더보기">⋯</button>`
    : "";
  let nick;
  if (c.is_anonymous && window.GALLA_ghost) {
    const g = window.GALLA_ghost(c.ghost_seed);          // 유령 페르소나 (프로필 이동 불가)
    nick = `<span class="cm-nick ghost-nick" style="color:${g.color}">${g.avatarHTML} ${g.name}</span>`;
  } else if (c.user_id && window.GALLA_userBadge) {
    // 아바타+닉+레벨 배지, 탭하면 유저시트(프로필/메시지)
    nick = window.GALLA_userBadge(c.user_id, c.nickname);
  } else {
    nick = `<span class="cm-nick">${esc(c.nickname || "익명")}</span>`;
  }
  return `<div class="comment-meta">${nick}<span class="cm-time">${timeAgoK(c.created_at)}</span>${menu}</div>`;
}

/* 투표 처리 (이벤트 위임) */
async function handleCommentVote(e) {
  const btn = e.target.closest(".cv-btn");
  if (!btn) return false;
  e.stopPropagation();

  const session = await getSessionSafe();
  if (!session?.user) {
    if (confirm("로그인이 필요합니다. 로그인하시겠어요?")) (window.GALLA_gotoLogin ? GALLA_gotoLogin() : (window.GALLA_nav||function(u){location.href=u})("login.html"));
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
    D.querySelectorAll(`.cv-btn[data-cid="${cid}"]`).forEach(b => {
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
      <div class="comment-body" data-cmt-text>${esc(root.body)}</div>

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
      window.GALLA_gotoLogin ? GALLA_gotoLogin() : ((window.GALLA_nav||function(u){location.href=u})("login.html"));
    }
    return;
  }

  // 유령 토글 — 활성(유령권 보유) 시에만 익명 게시, seed는 서버 트리거가 강제 주입
  const ghostOn = byId("comment-ghost")?.classList.contains("on") === true;
  let displayName = null, isAnon = false;
  if (ghostOn) {
    if (!window.__GHOST_ST?.active) {
      return promptGhostBuy();   // 만료/미보유면 구매 유도
    }
    isAnon = true;               // anon_name은 유령 렌더가 seed로 대체하므로 불필요
  } else {
    const { data: prof } = await supabase
      .from("user_profiles").select("nickname").eq("user_id", user.id).maybeSingle();
    displayName = prof?.nickname || "사용자";
  }

  const payload = {
    post_id: postId,
    body,
    anon_name: displayName,
    is_anonymous: isAnon,
    user_id: user.id,
    parent_id: replyTarget ? replyTarget.parentId : null
  };

  const { error } = await supabase
    .from("plaza_comments")
    .insert(payload);

  if (error) {
    if (String(error.message || "").includes("no_ghost_pass")) { promptGhostBuy(); return; }
    alert("댓글 등록 실패");
    console.error(error);
    return;
  }

  window.GALLA_toast && GALLA_toast(replyTarget ? "💬 답글이 등록됐어요" : "💬 댓글이 등록됐어요");
  replyTarget = null;
}

/* 유령 상태/토글 — 공용(ghost.js GALLA_ghostBind: 상태 라벨·토스트·구매 유도 내장) */
async function loadGhostState() {
  if (window.GALLA_ghostReady) await window.GALLA_ghostReady();
}
function promptGhostBuy() {
  if (confirm("👻 유령으로 활동하려면 유령권이 필요해요.\n상점에서 유령권을 구매할까요?")) {
    if (window.openShop) window.openShop(); else (window.GALLA_nav||function(u){location.href=u})("settings.html");
  }
}
window.GALLA_bindGhostToggle = function () {
  const btn = byId("comment-ghost");
  if (btn && window.GALLA_ghostBind) window.GALLA_ghostBind(btn);
};

function scrollToCommentInput() {
  if (!commentInput) return;
  const rect = commentInput.getBoundingClientRect();
  if (D !== document && D.scrollTo) {
    // SPA: 스크롤 주체는 view-host(자체 스크롤 판)
    const hostRect = D.getBoundingClientRect();
    D.scrollTo({ top: D.scrollTop + rect.top - hostRect.top - 120, behavior: "smooth" });
    return;
  }
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
      <div class="comment-body" data-cmt-text>${esc(reply.body)}</div>
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

async function initVoteAndComments() {
  let voting = false; // 중복 클릭 방지
  const voteScoreEl = byId("voteScore");
  const voteUpBtn = D.querySelector(".vote-up");
  const voteDownBtn = D.querySelector(".vote-down");

  const commentPill = D.querySelector(".comment-pill");
  const commentCountEl = byId("commentCount");
  const commentSubmitBtn = byId("commentSubmitBtn");

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

  await fetchPostDetail();   // 글부터 즉시 렌더

  // 투표상태·댓글·유령상태를 병렬로 — 예전엔 투표(2쿼리)를 기다리느라 댓글이 늦게 떴다(로드 지연).
  loadVoteState();

  // ✅ 이후 로그인/로그아웃 시에도 다시 동기화
  onAuth(async (event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
      await loadVoteState();
    }
  });

  fetchComments(commentCountEl);
  loadGhostState();
  window.GALLA_bindGhostToggle && window.GALLA_bindGhostToggle();
}

/* =========================
   글 저장(북마크) — 로그인 필수
========================= */
async function initPlazaBookmark() {
  const btn = byId("plazaBookmarkBtn");
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
      if (confirm("저장하려면 로그인이 필요합니다. 로그인하시겠어요?")) (window.GALLA_gotoLogin ? GALLA_gotoLogin() : (window.GALLA_nav||function(u){location.href=u})("login.html"));
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
  D.querySelector(".share-btn")?.addEventListener("click", () => {
    const url = window.GALLA_shareUrl ? window.GALLA_shareUrl("plaza", postId) : location.href;
    const title = postTitleEl && postTitleEl.textContent ? `💬 ${postTitleEl.textContent}` : "GALLA 광장";
    if (window.GALLA_share) return window.GALLA_share({ url, title, text: "갈라 광장에서 지금 뜨거운 이야기" });
    if (navigator.share) { navigator.share({ title, url }).catch(() => {}); return; }
    navigator.clipboard?.writeText(url).then(() => alert("링크가 복사되었습니다."));
  });
  // 🧡 갈비스 — 이 광장 글로 말 걸기(내 편 AI가 편들어줌). 실시간 제목으로 시드.
  D.querySelector(".galvis-btn")?.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    const t = (postTitleEl && postTitleEl.textContent || "광장 글").slice(0, 120);
    if (window.GALLA_askGalvis) window.GALLA_askGalvis({ type: "plaza", id: postId, title: t });
    else if (window.GALLA_openFriend) window.GALLA_openFriend();
  });
}

/* =========================
   초기화 (MPA/SPA 공용 진입점)
========================= */
async function initPlazaDetail(root, spaParams) {
  D = (root && root !== document && root.querySelector) ? root : document;

  // 클라이언트: SPA면 셸의 단일 클라이언트 재사용, MPA면 기존처럼 자체 생성(+전역 노출)
  if (document.body && document.body.dataset.page === "spa") {
    supabase = window.supabaseClient ||
      (window.waitForSupabaseClient ? await window.waitForSupabaseClient() : null);
    if (!supabase) return;
  } else {
    supabase = window.supabase.createClient(
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
    // 공용 헬퍼(ghost.js·items.js 등)는 window.supabaseClient를 본다 —
    // 이 페이지는 js/supabase.js를 안 쓰므로 여기서 직접 노출(없으면 유령권 연동이 전부 비로그인 판정)
    window.supabaseClient = supabase;
  }

  _sessP = null;
  onAuth(() => { _sessP = null; });

  // id 소스: SPA면 라우터 params, MPA면 쿼리스트링
  postId = (spaParams && spaParams.id != null)
    ? String(spaParams.id)
    : new URLSearchParams(location.search).get("id");

  if (!postId) {
    alert("잘못된 접근입니다.");
    return;
  }

  // 재-mount 대비 상태 리셋(스택은 매번 새로 mount)
  comments = []; replyTarget = null; myVote = 0; lastRenderedVote = 0;
  isVotingNow = false; myCommentVotes = {};

  commentList = byId("commentList");
  postTitleEl = D.querySelector(".post-title");
  postMetaEl = D.querySelector(".post-meta");
  postContentEl = D.querySelector(".post-content");
  commentInput = byId("commentInput");

  // 하단 입력바 여백 — SPA에선 셸 body가 아니라 이 판(view-host)에만 준다
  ((D === document) ? document.body : D).style.paddingBottom = "140px";

  /* 댓글 좋아요/싫어요 (이벤트 위임) */
  commentList?.addEventListener("click", handleCommentVote);

  initAuthButtons();
  await initVoteAndComments();
  initPlazaBookmark();
}

/* ═══ 모드 부트스트랩 ═══
   SPA 셸(app.html)이면 자동 초기화 금지 — 어댑터가 mount()로 부른다.
   MPA(단독 문서)면 기존과 동일 타이밍(DOMContentLoaded)에 자동 초기화. */
const __plazaPage = {
  _root: null,
  mount(root, params) { __plazaPage._root = root || document; return initPlazaDetail(__plazaPage._root, params || {}); },
  unmount() {
    // 실시간 채널·타이머 없음 — auth 리스너만 해제(스택 pop 후 잔류 방지)
    while (_authSubs.length) { try { _authSubs.pop().unsubscribe(); } catch (_) {} }
    _sessP = null;
    __plazaPage._root = null;
    D = document;
  },
  scrolltop() {
    const sc = (__plazaPage._root && __plazaPage._root !== document) ? __plazaPage._root : (document.scrollingElement || document.documentElement);
    try { sc.scrollTo({ top: 0, behavior: "smooth" }); } catch (_) { sc.scrollTop = 0; }
  },
};
window.GALLA_PAGE_PLAZA_DETAIL = __plazaPage;

if (!(document.body && document.body.dataset.page === "spa")) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { initPlazaDetail(document); });
  } else {
    initPlazaDetail(document);
  }
}
