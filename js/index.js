/********************************************
 *  INDEX.JS — GALLA FINAL REAL DATA VERSION
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

// 🔥 FIXED WHITE moreIcon
const moreIcon = `
<svg width="20" height="20" viewBox="0 0 24 24"
     fill="#ffffff" stroke="#ffffff" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round">
  <circle cx="5" cy="12" r="2"></circle>
  <circle cx="12" cy="12" r="2"></circle>
  <circle cx="19" cy="12" r="2"></circle>
</svg>
`;

// ▼ 투표 기록
const voteMemory = JSON.parse(localStorage.getItem("votes") || "{}");

// =========================================
// 🔥 GLOBAL DATA STORE
// =========================================
let cards = [];

// =========================================
// 🔥 CARD RENDERER
// =========================================
function renderCard(data) {

    const total = data.pro + data.con || 1;
    const proPct = Math.round((data.pro / total) * 100);
    const conPct = 100 - proPct;

    const sTotal = data.supPro + data.supCon || 1;
    const sProPct = (data.supPro / sTotal) * 100;
    const sConPct = (data.supCon / sTotal) * 100;

    const voted = voteMemory[data.id];

    return `
    <div class="card" data-id="${data.id}">

        <div class="card-top">
            <span>${data.category}</span>
            <span>${data.time}</span>
        </div>

        <div class="card-author">
            <div class="author-wrap">
                <span class="author-name">${data.author}</span>
                <span class="level-badge">Lv.${data.level}</span>
            </div>
            <button class="follow-btn open-modal" data-msg="팔로우 기능 준비 중">+ 팔로우</button>
        </div>

        <div class="card-title">${data.title}</div>
        <div class="card-desc">${data.desc}</div>

        <img src="${data.thumb || "assets/logo.png"}" class="card-thumb" />

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

            <button class="more-btn open-modal" data-msg="더보기 메뉴 준비 중">
                ${moreIcon}
            </button>
        </div>

    </div>`;
}

// =========================================
// 🔥 EVENTS
// =========================================
function attachEvents() {

    document.querySelectorAll(".vote-btn").forEach(btn => {
        btn.onclick = () => {
            const type = btn.dataset.type;
            const card = btn.closest(".card");
            const id = Number(card.dataset.id);

            if (voteMemory[id]) return;

            const data = cards.find(c => c.id === id);
            if (type === "pro") data.pro++;
            else data.con++;

            voteMemory[id] = type;
            localStorage.setItem("votes", JSON.stringify(voteMemory));

            refreshCard(id);
        };
    });

    document.querySelectorAll(".open-modal").forEach(el => {
        el.onclick = () => openModal(el.dataset.msg);
    });
}

// =========================================
// 🔥 DATA FETCH
// =========================================
async function loadData() {
    const supabase = window.supabaseClient;

    const { data, error } = await supabase
    .from("issues")
    .select(`
        id, title, description, category, created_at,
        pro_votes, con_votes,
        sup_pro, sup_con,
        users (
        id,
        user_profiles (nickname, level)
        ),
        issue_thumbnails (url)
    `)
    .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        return;
    }

    cards = data.map(row => ({
    id: row.id,
    category: row.category,
    author: row.users?.user_profiles?.nickname || "익명",
    level: row.users?.user_profiles?.level || 1,
    time: new Date(row.created_at).toLocaleDateString(),
    title: row.title,
    desc: row.description,
    pro: row.pro_votes,
    con: row.con_votes,
    supPro: row.sup_pro,
    supCon: row.sup_con,
    thumb: row.issue_thumbnails?.[0]?.url
    }));

    loadBest();
    loadRecommend();
}

// =========================================
// 🔥 LOADERS
// =========================================
function refreshCard(id) {
    const data = cards.find(c => c.id === id);
    const el = document.querySelector(`.card[data-id="${id}"]`);
    el.outerHTML = renderCard(data);
    attachEvents();
}

function loadBest() {
    bestList.innerHTML = "";
    cards.slice(0, 3).forEach(c => bestList.innerHTML += renderCard(c));
    attachEvents();
}

let rec = 3;
function loadRecommend() {
    for (let i = 0; i < 3; i++) {
        if (!cards[rec]) return;
        recommendList.innerHTML += renderCard(cards[rec]);
        rec++;
    }
    attachEvents();
}

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

// INIT
loadData();