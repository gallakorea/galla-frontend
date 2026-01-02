/* ===========================================================
   comment-modal.js
   - 댓글 모달 열기/닫기
   - 대댓글 2단계까지 렌더링
   - 좋아요 / 답글 버튼
=========================================================== */

let commentModalOverlay;
let commentModal;
let commentBody;

/* -----------------------------------------------------------
   모달 오픈
----------------------------------------------------------- */
function openCommentModal() {
    if (!commentModalOverlay) {
        commentModalOverlay = document.createElement("div");
        commentModalOverlay.className = "comment-modal-overlay";

        commentModal = document.createElement("div");
        commentModal.className = "comment-modal";

        commentModal.innerHTML = `
            <div class="comment-modal-header">
                <h3>댓글</h3>
                <button class="close-btn">&times;</button>
            </div>

            <div class="comment-modal-body"></div>

            <div class="comment-input-box">
                <input class="comment-input" placeholder="댓글 작성하기..." />
                <button class="comment-send-btn">전송</button>
            </div>
        `;

        document.body.appendChild(commentModalOverlay);
        document.body.appendChild(commentModal);

        commentBody = commentModal.querySelector(".comment-modal-body");

        attachCommentEvents();
    }

    // 표시
    commentModalOverlay.classList.add("active");
    commentModal.classList.add("active");

    // 더미 데이터 로드
    loadDummyComments();
}

/* -----------------------------------------------------------
   모달 닫기
----------------------------------------------------------- */
function closeCommentModal() {
    if (!commentModal) return;

    commentModalOverlay.classList.remove("active");
    commentModal.classList.remove("active");
}

/* -----------------------------------------------------------
   이벤트 바인딩
----------------------------------------------------------- */
function attachCommentEvents() {
    // 닫기 버튼
    commentModal.addEventListener("click", (e) => {
        if (e.target.classList.contains("close-btn")) {
            closeCommentModal();
        }
    });

    // 오버레이 클릭 시 닫기
    commentModalOverlay.addEventListener("click", closeCommentModal);

    // 댓글 전송
    commentModal.querySelector(".comment-send-btn").addEventListener("click", sendComment);
}

/* -----------------------------------------------------------
   더미 댓글 데이터
----------------------------------------------------------- */
const dummyComments = [
    {
        id: 1,
        username: "홍길동",
        time: "1시간 전",
        text: "정말 중요한 이슈네요!",
        replies: [
            {
                id: 11,
                username: "이서준",
                time: "45분 전",
                text: "저도 동의합니다",
                replies: []
            },
            {
                id: 12,
                username: "김민지",
                time: "33분 전",
                text: "더 자세히 논의가 필요합니다",
                replies: [
                    {
                        id: 121,
                        username: "박도현",
                        time: "20분 전",
                        text: "맞아요. 자료도 공유해요!",
                        replies: []
                    }
                ]
            }
        ]
    },
    {
        id: 2,
        username: "최지원",
        time: "2시간 전",
        text: "반대 의견도 충분히 들을 필요 있음",
        replies: []
    }
];

/* -----------------------------------------------------------
   댓글 렌더링
----------------------------------------------------------- */
function renderComment(comment, level = 0) {
    let levelClass = "";
    if (level === 1) levelClass = "reply-level-1";
    if (level === 2) levelClass = "reply-level-2";

    let html = `
        <div class="comment-item ${levelClass}">
            <div class="comment-top">
                <img src="assets/default-thumb.jpg" class="comment-avatar" />
                <div class="comment-info">
                    <span class="comment-username">${comment.username}</span>
                    <span class="comment-time">${comment.time}</span>
                </div>
            </div>

            <div class="comment-text">${comment.text}</div>

            <div class="comment-actions">
                <button class="comment-like">좋아요</button>
                <button class="comment-reply" data-id="${comment.id}" data-level="${level}">
                    답글달기
                </button>
            </div>
        </div>
    `;

    // 자식 댓글
    comment.replies.forEach((reply) => {
        html += renderComment(reply, Math.min(level + 1, 2));
    });

    return html;
}

function loadDummyComments() {
    commentBody.innerHTML = "";
    dummyComments.forEach((c) => {
        commentBody.innerHTML += renderComment(c, 0);
    });
}

/* -----------------------------------------------------------
   댓글 전송
----------------------------------------------------------- */
function sendComment() {
    const input = commentModal.querySelector(".comment-input");
    const text = input.value.trim();
    if (text === "") return;

    dummyComments.unshift({
        id: Date.now(),
        username: "사용자",
        time: "방금 전",
        text,
        replies: []
    });

    loadDummyComments();
    input.value = "";
}

/* -----------------------------------------------------------
   답글달기 이벤트
----------------------------------------------------------- */
document.addEventListener("click", (e) => {
    if (!e.target.classList.contains("comment-reply")) return;

    const level = parseInt(e.target.dataset.level || "0");

    const name = prompt("답글 내용 입력:");
    if (!name) return;

    alert("답글 기능은 실제 버전에서 활성화됩니다.");
});