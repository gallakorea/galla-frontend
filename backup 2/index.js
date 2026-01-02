/********************************************
 *  INDEX.JS — GALLA FINAL PATCHED VERSION
 *  - LEVEL 표시 기능 통합
 *  - moreIcon 화이트 확정
 *  - 카드 렌더러 전체 안정성 개선
 ********************************************/

const bestList = document.getElementById("best-list");
const recommendList = document.getElementById("recommend-list");
const bestMore = document.getElementById("best-more");

// 스크롤 복원
if (localStorage.getItem("scrollPos")) {
    window.scrollTo(0, Number(localStorage.getItem("scrollPos")));
}

// 스크롤 저장
window.addEventListener("scroll", () => {
    localStorage.setItem("scrollPos", window.scrollY);
});

// 🔥 FIXED WHITE moreIcon — 완전히 하얗게 보장
const moreIcon = `
<svg width="20" height="20" viewBox="0 0 24 24"
     fill="#ffffff" stroke="#ffffff" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round">
  <circle cx="5" cy="12" r="2"></circle>
  <circle cx="12" cy="12" r="2"></circle>
  <circle cx="19" cy="12" r="2"></circle>
</svg>
`;

// 🔥 LEVEL 점수 (임시 데이터)
const dummyLevel = {
    "한유저": 12,
    "홍길동": 5,
    "스탁맨": 9
};

// ▼ 투표 기록 load
const voteMemory = JSON.parse(localStorage.getItem("votes") || "{}");

// ▼ 게시물 더미 데이터
let dummyCards = [
{
    id: 1,
    category: "세계·여행",
    author: "한유저",
    time: "6시간 전",
    title: "태국 치안 문제",
    desc: "태국 여행 중 혼불을 극명하게 갈리는 치안 논쟁",
    pro: 46, con: 54,
    supPro: 111000,
    supCon: 199000
},
{
    id: 2,
    category: "정치·사회",
    author: "홍길동",
    time: "2시간 전",
    title: "여가부 폐지해야?",
    desc: "정부 조직 개편을 둘러싼 논쟁",
    pro: 40, con: 60,
    supPro: 222000,
    supCon: 218000
},
{
    id: 3,
    category: "경제·투자",
    author: "스탁맨",
    time: "4시간 전",
    title: "부동산 폭등?",
    desc: "금리와 집값의 관계를 두고 충돌",
    pro: 52, con: 48,
    supPro: 138000,
    supCon: 100000
}
];


// =========================================
// 🔥 CARD RENDERER (LEVEL + MORE 패치됨)
// =========================================
function renderCard(data) {

    // Perc 계산
    let total = data.pro + data.con;
    let proPct = Math.round((data.pro / total) * 100);
    let conPct = 100 - proPct;

    // 후원 퍼센트
    let sTotal = data.supPro + data.supCon;
    let sProPct = (data.supPro / sTotal) * 100;
    let sConPct = (data.supCon / sTotal) * 100;

    // LEVEL
    let level = dummyLevel[data.author] || 1;

    let voted = voteMemory[data.id];

    return `
    <div class="card" data-id="${data.id}">

        <div class="card-top">
            <span>${data.category}</span>
            <span>${data.time}</span>
        </div>

        <!-- 🔥 AUTHOR + LEVEL -->
        <div class="card-author">
            <div class="author-wrap">
                <span class="author-name">${data.author}</span>
                <span class="level-badge">Lv.${level}</span>
            </div>
            <button class="follow-btn open-modal" data-msg="팔로우 기능 준비 중">+ 팔로우</button>
        </div>

        <div class="card-title">${data.title}</div>
        <div class="card-desc">${data.desc}</div>

        <img src="assets/logo.png" class="card-thumb" />

        <div class="speech-btn open-modal" data-msg="엘리베이터 스피치 기능 준비 중">🎥 1분 엘리베이터 스피치</div>

        <div class="vote-title">👍 찬반 투표 현황</div>

        <div class="vote-bar">
            <div class="vote-pro" style="width:${proPct}%"></div>
            <div class="vote-con" style="width:${conPct}%"></div>
        </div>

        <div class="vote-stats">
            <span>${proPct}%</span>
            <span>${conPct}%</span>
        </div>

        <div class="vote-buttons">
            <button class="btn-pro vote-btn ${voted === "pro" ? "active-vote" : ""}" data-type="pro">👍 찬성이오</button>
            <button class="btn-con vote-btn ${voted === "con" ? "active-vote" : ""}" data-type="con">👎 난 반댈세</button>
        </div>

        <div class="support-box">

            <div class="support-title">⚔️ 후원 전쟁 현황</div>

            <div class="support-bar">
                <div class="sup-pro" style="width:${sProPct}%"></div>
                <div class="sup-con" style="width:${sConPct}%"></div>
            </div>

            <div class="support-stats">
                <span>₩${data.supPro.toLocaleString()}</span>
                <span>₩${data.supCon.toLocaleString()}</span>
            </div>

            <div class="support-btn open-modal" data-msg="후원 기능 준비 중">⚔️ 이 이슈 후원하기</div>
        </div>

        <div class="card-footer">
            <div class="footer-icons">
                <img src="assets/icons/icon-comment.svg" class="open-modal" data-msg="댓글 준비 중"/>
                <img src="assets/icons/icon-bookmark.svg" class="open-modal" data-msg="북마크 준비 중"/>
                <img src="assets/icons/icon-share.svg" class="open-modal" data-msg="공유 준비 중"/>
            </div>

            <!-- 🔥 FIXED WHITE MORE ICON -->
            <button class="more-btn open-modal" data-msg="더보기 메뉴 준비 중">
                ${moreIcon}
            </button>
        </div>

    </div>`;
}


// 카드 업데이트
function refreshCard(cardId) {
    const data = dummyCards.find(c => c.id == cardId);
    const el = document.querySelector(`.card[data-id="${cardId}"]`);
    el.outerHTML = renderCard(data);
    attachEvents();
}


// =========================================
// 🔥 투표 이벤트 시스템
// =========================================
function attachEvents() {

    // 투표
    document.querySelectorAll(".vote-btn").forEach(btn => {
        btn.onclick = () => {
            const type = btn.dataset.type;
            const card = btn.closest(".card");
            const id = Number(card.dataset.id);
            if (voteMemory[id]) return;

            let data = dummyCards.find(c => c.id === id);
            if (type === "pro") data.pro++;
            else data.con++;

            voteMemory[id] = type;
            localStorage.setItem("votes", JSON.stringify(voteMemory));

            refreshCard(id);
        };
    });

    // 모달 호출
    document.querySelectorAll(".open-modal").forEach(el => {
        el.onclick = () => openModal(el.dataset.msg);
    });
}


// BEST LOAD
function loadBest() {
    bestList.innerHTML = "";
    dummyCards.forEach(c => bestList.innerHTML += renderCard(c));
    attachEvents();
}
loadBest();

// RECOMMEND LOAD
let rec = 0;
function loadRecommend() {
    for (let i = 0; i < 3; i++) {
        recommendList.innerHTML += renderCard(dummyCards[rec % dummyCards.length]);
        rec++;
    }
    attachEvents();
}
loadRecommend();


// 무한 스크롤
window.addEventListener("scroll", () => {
    if (window.innerHeight + window.scrollY + 400 >= document.body.offsetHeight) {
        loadRecommend();
    }
});

// MODAL
function openModal(msg) {
    const modal = document.getElementById("modal");
    document.getElementById("modal-text").textContent = msg;
    modal.style.display = "flex";
}
document.getElementById("modal-close").onclick = () => {
    document.getElementById("modal").style.display = "none";
};

// NAVIGATION
document.querySelectorAll(".nav-item")[0].onclick = () => location.href = "index.html";
document.querySelectorAll(".nav-item")[1].onclick = () => location.href = "search.html";
document.querySelectorAll(".nav-item")[2].onclick = () => location.href = "write.html";
document.querySelectorAll(".nav-item")[3].onclick = () => location.href = "random.html";
document.querySelectorAll(".nav-item")[4].onclick = () => location.href = "mypage.html";