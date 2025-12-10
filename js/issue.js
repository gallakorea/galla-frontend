/* ==========================================================================
   기본 데이터
========================================================================== */
let vote = { pro: 46, con: 54 };
let support = { pro: 111000, con: 199000 };

let comments = [
    { id: 1, parent: null, author: "익명1", text: "태국은 아직도 충분히 안전합니다.", likes: 12, dislikes: 1, time: Date.now() },
    { id: 2, parent: null, author: "익명2", text: "요즘 사건들 보면 위험하죠.", likes: 5, dislikes: 7, time: Date.now() - 100000 },
    { id: 3, parent: 2, author: "익명3", text: "저는 반대 의견입니다.", likes: 2, dislikes: 0, time: Date.now() - 50000 }
];

let commentId = 100;
let replyTarget = null;

/* ==========================================================================
   스크롤 복귀
========================================================================== */
window.addEventListener("beforeunload", () => {
    sessionStorage.setItem("issue-scroll", window.scrollY);
});
window.addEventListener("load", () => {
    const lastScroll = sessionStorage.getItem("issue-scroll");
    if (lastScroll) window.scrollTo(0, Number(lastScroll));
});

/* ==========================================================================
   설명 자동 추가
========================================================================== */
document.querySelector(".issue-explain")?.insertAdjacentHTML(
    "beforeend",
    `
    <p style="color:#ddd;">
        이번 이슈는 최근 크게 떠오르는 "태국 치안 문제"에 대한 국내 이용자들의 의견 흐름을 정리한 것입니다.
        20~40대가 주요 참여층이며 실제 서비스에서는 자동 데이터 크롤링 기반으로 분석됩니다.
    </p>
    `
);

/* ==========================================================================
   투표 UI
========================================================================== */
function updateVoteUI() {
    const total = vote.pro + vote.con;
    const proPer = Math.round((vote.pro / total) * 100);
    const conPer = 100 - proPer;

    document.getElementById("vote-pro-bar").style.width = `${proPer}%`;
    document.getElementById("vote-con-bar").style.width = `${conPer}%`;
    document.getElementById("vote-pro-text").innerText = `${proPer}%`;
    document.getElementById("vote-con-text").innerText = `${conPer}%`;
}
document.getElementById("btn-vote-pro").onclick = () => { vote.pro++; updateVoteUI(); };
document.getElementById("btn-vote-con").onclick = () => { vote.con++; updateVoteUI(); };
updateVoteUI();

/* ==========================================================================
   후원 UI
========================================================================== */
function updateSupportUI() {
    const total = support.pro + support.con;
    const proPer = (support.pro / total) * 100;
    const conPer = 100 - proPer;

    document.getElementById("sup-pro-bar").style.width = `${proPer}%`;
    document.getElementById("sup-con-bar").style.width = `${conPer}%`;
    document.getElementById("sup-pro-amount").innerText = "₩" + support.pro.toLocaleString();
    document.getElementById("sup-con-amount").innerText = "₩" + support.con.toLocaleString();
}
updateSupportUI();

/* ==========================================================================
   HEADER ⋯ 메뉴 (ID 수정된 정상 버전)
========================================================================== */
const headerMoreBtn = document.querySelector(".more-header-btn");
const headerMoreModal = document.getElementById("header-more-modal");

headerMoreBtn.addEventListener("click", () => {
    headerMoreModal.hidden = false;
});

// 닫기 처리 — 배경 또는 닫기 버튼
headerMoreModal.addEventListener("click", (e) => {
    if (e.target === headerMoreModal || e.target.classList.contains("more-close")) {
        headerMoreModal.hidden = true;
    }
});

/* ==========================================================================
   댓글 렌더링
========================================================================== */
const listEl = document.getElementById("comment-list");

document.getElementById("main-reply-btn").onclick = () => {
    const txt = document.getElementById("main-reply").value.trim();
    if (!txt) return;

    comments.push({
        id: commentId++,
        parent: null,
        author: "익명",
        text: txt,
        likes: 0,
        dislikes: 0,
        time: Date.now()
    });

    document.getElementById("main-reply").value = "";
    renderComments();
};

function renderComments(sort = "latest") {
    listEl.innerHTML = "";

    let roots = comments.filter(c => c.parent === null);
    roots.sort(sort === "latest"
        ? (a, b) => b.time - a.time
        : (a, b) => (b.likes - b.dislikes) - (a.likes - a.dislikes)
    );

    roots.forEach(root => {
        renderCommentItem(root, 0);
        renderReplies(root.id, 1);
    });
}

function renderCommentItem(comment, depth) {
    const div = document.createElement("div");
    div.className = "comment-item";
    if (depth > 0) div.classList.add("reply");

    div.dataset.id = comment.id;

    div.innerHTML = `
        <div class="comment-header">
            <span class="comment-author">${comment.author}</span>
            <span class="comment-menu">⋯</span>
        </div>

        <div class="comment-text">${comment.text}</div>

        <div class="comment-actions">
            <span class="like-btn" data-id="${comment.id}">👍 ${comment.likes}</span>
            <span class="dislike-btn" data-id="${comment.id}">👎 ${comment.dislikes}</span>
            <span class="reply-btn" data-id="${comment.id}" data-author="${comment.author}">답글</span>
            <span class="share-btn" data-id="${comment.id}">공유</span>
        </div>
    `;

    listEl.appendChild(div);
}

function renderReplies(parentId, depth) {
    comments
        .filter(c => c.parent === parentId)
        .sort((a, b) => a.time - b.time)
        .forEach(c => {
            renderCommentItem(c, depth);
            renderReplies(c.id, depth + 1);
        });
}

renderComments();

/* 댓글 정렬 */
document.querySelectorAll(".sort-btn").forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll(".sort-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderComments(btn.dataset.sort);
    };
});

/* ==========================================================================
   댓글 이벤트 핸들러
========================================================================== */
let activeReplyBox = null;
let selectedCommentId = null;

document.addEventListener("click", (e) => {
    const id = Number(e.target.dataset.id);

    if (e.target.classList.contains("like-btn")) {
        comments.find(x => x.id === id).likes++;
        renderComments();
    }

    if (e.target.classList.contains("dislike-btn")) {
        comments.find(x => x.id === id).dislikes++;
        renderComments();
    }

    if (e.target.classList.contains("reply-btn")) {
        openReplyBox(e.target.closest(".comment-item"), id, e.target.dataset.author);
    }

    if (e.target.classList.contains("share-btn")) {
        navigator.clipboard.writeText(`${location.href}#comment-${id}`);
        alert("댓글 링크 복사됨");
    }

    if (e.target.classList.contains("comment-menu")) {
        selectedCommentId = id;
        document.getElementById("comment-action-modal").hidden = false;
    }

    if (e.target.dataset.close !== undefined ||
        e.target.id === "comment-action-modal") {
        document.getElementById("comment-action-modal").hidden = true;
    }

    if (e.target.classList.contains("action-item")) {
        handleCommentAction(e.target.dataset.action, selectedCommentId);
        document.getElementById("comment-action-modal").hidden = true;
    }
});

/* 대댓글 박스 */
function openReplyBox(commentElement, parentId, parentAuthor) {
    replyTarget = parentId;

    if (activeReplyBox) activeReplyBox.remove();

    const box = document.createElement("div");
    box.className = "reply-box";

    box.innerHTML = `
        <textarea class="reply-input">@${parentAuthor} </textarea>
        <button class="reply-submit">등록</button>
        <button class="reply-cancel">취소</button>
    `;

    commentElement.after(box);
    activeReplyBox = box;

    box.querySelector(".reply-submit").onclick = submitReply;

    // 수정된 취소 버튼
    box.querySelector(".reply-cancel").onclick = () => {
        box.remove();
        activeReplyBox = null;
    };
}

function submitReply() {
    const text = activeReplyBox.querySelector(".reply-input").value.trim();
    if (!text) return;

    comments.push({
        id: commentId++,
        parent: replyTarget,
        author: "익명",
        text,
        likes: 0,
        dislikes: 0,
        time: Date.now()
    });

    activeReplyBox.remove();
    activeReplyBox = null;
    replyTarget = null;
    renderComments();
}

/* ==========================================================================
   댓글 옵션 기능
========================================================================== */
function handleCommentAction(action, id) {
    switch (action) {
        case "copy":
            navigator.clipboard.writeText(`${location.href}#comment-${id}`);
            alert("댓글 링크 복사됨");
            break;
        case "save":
            alert("저장 완료 (더미)");
            break;
        case "hide":
            alert("관심 없음 처리됨 (더미)");
            break;
        case "mute":
            alert("업데이트 숨김 (더미)");
            break;
        case "restrict":
            alert("제한됨 (더미)");
            break;
        case "block":
            alert("차단됨 (더미)");
            break;
        case "report":
            alert("신고됨 (더미)");
            break;
    }
}

/* ==========================================================================
   스피치 모달
========================================================================== */
const speechBackdrop = document.querySelector(".speech-backdrop");
const speechSheet = document.querySelector(".speech-sheet");
const video = document.getElementById("speech-video");
const playIcon = document.getElementById("play-icon");
const progressBar = document.getElementById("progress-bar");

document.getElementById("open-video-modal").onclick = () => {
    video.src = "/videos/speech_001.mp4";
    speechBackdrop.hidden = false;

    setTimeout(() => {
        speechSheet.style.bottom = "0";
        video.play();
    }, 20);
};

document.querySelector(".speech-close").onclick = closeSpeech;

function closeSpeech() {
    speechSheet.style.bottom = "-100%";
    video.pause();
    video.currentTime = 0;
    setTimeout(() => speechBackdrop.hidden = true, 300);
}

video.addEventListener("click", () => {
    if (video.paused) {
        video.play();
        showPlayIcon("▶");
    } else {
        video.pause();
        showPlayIcon("❚❚");
    }
});

function showPlayIcon(icon) {
    playIcon.innerText = icon;
    playIcon.style.opacity = 1;
    setTimeout(() => playIcon.style.opacity = 0, 350);
}

video.addEventListener("timeupdate", () => {
    progressBar.style.width = (video.currentTime / video.duration) * 100 + "%";
});
video.addEventListener("ended", () => closeSpeech());

/* ==========================================================================
   통계 데이터
========================================================================== */
const statData = {
    gender: { male: 56, female: 44 },

    age: {
        "10대": 5,
        "20대": 23,
        "30대": 29,
        "40대": 22,
        "50대": 15,
        "60+": 6
    },

    region: {
        "서울": 12, "경기": 18, "인천": 6,
        "부산": 7, "대구": 5, "광주": 4,
        "대전": 4, "울산": 3, "세종": 2,
        "강원": 4, "충북": 3, "충남": 4,
        "전북": 3, "전남": 3, "경북": 4,
        "경남": 5, "제주": 3
    },

    genderVote: {
        "남성": [52, 48],
        "여성": [49, 51]
    },

    ageVote: {
        "10대": [50, 50],
        "20대": [55, 45],
        "30대": [48, 52],
        "40대": [46, 54],
        "50대": [49, 51],
        "60+": [53, 47]
    },

    regionVote: {
        "서울": [51, 49],
        "경기": [48, 52],
        "인천": [50, 50],
        "부산": [53, 47],
        "대구": [47, 53],
        "광주": [45, 55],
        "대전": [52, 48],
        "울산": [49, 51],
        "세종": [50, 50],
        "강원": [48, 52],
        "충북": [51, 49],
        "충남": [50, 50],
        "전북": [47, 53],
        "전남": [46, 54],
        "경북": [52, 48],
        "경남": [49, 51],
        "제주": [50, 50]
    }
};

/* ==========================================================================
   통계 렌더링 함수
========================================================================== */
function renderGenderDualBar() {
    const { male, female } = statData.gender;
    document.getElementById("gender-dual").innerHTML = `
        <div class="dual-bar-labels">
            <span>남성 ${male}%</span>
            <span>여성 ${female}%</span>
        </div>
        <div class="dual-bar">
            <div class="dual-left" style="width:${male}%"></div>
            <div class="dual-right" style="width:${female}%"></div>
        </div>
    `;
}

function renderAgeChart() {
    const root = document.getElementById("age-chart");
    root.innerHTML = "";
    Object.entries(statData.age).forEach(([age, pct]) => {
        root.innerHTML += `
            <div class="age-row">
                <div class="age-header">
                    <span>${age}</span>
                    <span>${pct}%</span>
                </div>
                <div class="age-bar">
                    <div class="age-fill" style="width:${pct}%"></div>
                </div>
            </div>
        `;
    });
}

function renderRegionHeatmap() {
    const root = document.getElementById("region-heatmap");
    root.innerHTML = "";
    const max = Math.max(...Object.values(statData.region));
    Object.entries(statData.region).forEach(([name, pct]) => {
        const intensity = Math.floor((pct / max) * 160 + 60);
        const color = `rgb(${intensity},70,100)`;
        root.innerHTML += `
            <div class="region-cell" style="background:${color}">
                ${name}<br>${pct}%
            </div>
        `;
    });
}

function renderVoteBars(target, dataObj) {
    const root = document.getElementById(target);
    root.innerHTML = "";
    Object.entries(dataObj).forEach(([label, [pro, con]]) => {
        root.innerHTML += `
            <div class="vote-item">
                <div class="vote-labels">
                    <span>${label} · 찬성 ${pro}%</span>
                    <span>반대 ${con}%</span>
                </div>
                <div class="vote-bar">
                    <div class="vote-pro" style="width:${pro}%"></div>
                    <div class="vote-con" style="width:${con}%"></div>
                </div>
            </div>
        `;
    });
}

function renderAISummary() {
    document.getElementById("ai-summary").innerHTML =
        "수도권 참여율이 높고 20~40대가 핵심 참여층입니다.<br>찬반은 크게 갈리지 않는 균형형 여론입니다.";
}

/* ==========================================================================
   통계 실행
========================================================================== */
renderGenderDualBar();
renderAgeChart();
renderRegionHeatmap();
renderVoteBars("gender-vote", statData.genderVote);
renderVoteBars("age-vote", statData.ageVote);
renderVoteBars("region-vote", statData.regionVote);
renderAISummary();

/* ==========================================================================
   네비게이션 이동
========================================================================== */
document.querySelectorAll(".nav-item")[0].onclick = () => location.href = "index.html";
document.querySelectorAll(".nav-item")[1].onclick = () => location.href = "search.html";
document.querySelectorAll(".nav-item")[2].onclick = () => location.href = "write.html";
document.querySelectorAll(".nav-item")[3].onclick = () => location.href = "random.html";
document.querySelectorAll(".nav-item")[4].onclick = () => location.href = "mypage.html";

document.querySelector(".back-btn").onclick = () => location.href = "index.html";

let startX = 0;
document.addEventListener("touchstart", (e) => startX = e.touches[0].clientX);
document.addEventListener("touchend", (e) => {
    if (e.changedTouches[0].clientX - startX > 80) location.href = "index.html";
});