/* ===========================================================
   feed.js
   - index.html 전용 피드 로직
   - 팔로우 버튼
   - 헤더 스크롤 숨김
   - 댓글 모달 연결(comment-modal.js)
   - 더보기 메뉴 placeholder
   - 더미 데이터 로딩 구조
=========================================================== */

/* -----------------------------------------------------------
   1) 헤더 스크롤 시 숨김 처리
----------------------------------------------------------- */
let lastScrollY = 0;
const header = document.getElementById("top-header");

window.addEventListener("scroll", () => {
    const currentY = window.scrollY;

    if (currentY > lastScrollY && currentY > 50) {
        header.classList.add("hide");
    } else {
        header.classList.remove("hide");
    }

    lastScrollY = currentY;
});

/* -----------------------------------------------------------
   2) 팔로우 버튼(+팔로우 → 팔로잉)
----------------------------------------------------------- */
document.addEventListener("click", (e) => {
    if (e.target.classList.contains("follow-btn")) {
        const btn = e.target;

        if (btn.classList.contains("following")) {
            // 언팔
            btn.classList.remove("following");
            btn.textContent = "+ 팔로우";
            btn.style.color = "#ffd93b";
        } else {
            // 팔로우
            btn.classList.add("following");
            btn.textContent = "팔로잉";
            btn.style.color = "#ccc";
        }
    }
});

/* -----------------------------------------------------------
   3) 댓글 버튼 → 댓글 모달 실행
      (comment-modal.js에서 함수 제공)
----------------------------------------------------------- */
document.addEventListener("click", (e) => {
    if (e.target.closest(".icon-btn")) {
        const img = e.target.closest(".icon-btn").querySelector("img");

        if (!img) return;

        if (img.src.includes("icon-comment")) {
            // comment-modal.js 제공 함수
            if (typeof openCommentModal === "function") {
                openCommentModal();
            }
        }
    }
});

/* -----------------------------------------------------------
   4) 더보기 메뉴 placeholder
      (추후 신고/공유/차단 기능 추가)
----------------------------------------------------------- */
document.addEventListener("click", (e) => {
    if (e.target.closest(".more-btn")) {
        alert("더보기 기능은 곧 업데이트됩니다.");
    }
});

/* -----------------------------------------------------------
   5) 더미 데이터 로딩 예시
      (실제 Supabase 연동 시 이 구조 유지!)
----------------------------------------------------------- */
const feedContainer = document.querySelector(".feed-container");

/*
    예시 데이터 형식
    실제 DB 연동 시 아래 구조 그대로 사용하면 됨.
*/
const dummyFeedData = [
    {
        id: 101,
        category: "사회",
        time: "1시간 전",
        author: "박시우",
        title: "대중교통 요금 다시 올려야 할까?",
        summary: "적자 누적 문제로 버스/지하철 요금 인상 논의가 다시 대두되고 있는데...",
        thumb: "assets/default-thumb.jpg"
    },
    {
        id: 102,
        category: "문화",
        time: "3시간 전",
        author: "최민정",
        title: "극장 예매 수수료, 폐지해야 한다?",
        summary: "영화 티켓 값을 올리는 숨겨진 요인이라는 논란이 있는...",
        thumb: "assets/default-thumb.jpg"
    }
];

/* -----------------------------------------------------------
   6) 더미 데이터 자동 렌더링 (실제 DB 연결 시 교체)
----------------------------------------------------------- */

function renderFeedCard(item) {
    return `
    <article class="feed-card" data-id="${item.id}">
        <div class="feed-top">
            <span class="category">${item.category}</span>
            <span class="time">· ${item.time}</span>
            <button class="more-btn"><img src="assets/icons/icon-more.svg"></button>
        </div>

        <div class="feed-author">
            <div class="author-left">
                <img src="assets/default-thumb.jpg" class="author-img" />
                <span class="author-name">${item.author}</span>
            </div>
            <button class="follow-btn">+ 팔로우</button>
        </div>

        <h3 class="feed-title">${item.title}</h3>
        <p class="feed-summary">${item.summary}</p>

        <img src="${item.thumb}" class="feed-thumb" />

        <button class="speech-btn">🎤 1분 스피치 듣기</button>

        <!-- 투표 배틀 -->
        <div class="vote-battle" data-id="${item.id}">
            <div class="yes-bar"></div>
            <div class="no-bar"></div>
        </div>

        <!-- 후원 배틀 -->
        <div class="support-battle" data-id="${item.id}">
            <div class="support-left"></div>
            <div class="support-right"></div>
        </div>

        <div class="action-btns">
            <button class="yes-btn">찬성</button>
            <button class="no-btn">반대</button>
            <button class="support-btn">후원하기</button>
        </div>

        <div class="feed-icons">
            <button class="icon-btn"><img src="assets/icons/icon-comment.svg"></button>
            <button class="icon-btn"><img src="assets/icons/icon-bookmark.svg"></button>
            <button class="icon-btn"><img src="assets/icons/icon-share.svg"></button>
        </div>
    </article>
    `;
}

function loadDummyFeed() {
    dummyFeedData.forEach(item => {
        feedContainer.innerHTML += renderFeedCard(item);
    });
}

// 페이지 로드 시 자동 실행
window.addEventListener("DOMContentLoaded", () => {
    loadDummyFeed();
});