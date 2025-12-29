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
let speechIndex = 0;
let speechList = [];

let speechModal;
let speechVideo;
let preloadVideo;
let speechLoading;

// =========================================
// 🔥 CARD RENDERER
// =========================================
function renderCard(data) {

    const total = data.pro + data.con || 1;
    const proPct = Math.round((data.pro / total) * 100);
    const conPct = 100 - proPct;

    const voted = voteMemory[data.id];

    const w = data.war || {
    pro:{total:0,same:0,oppo:0},
    con:{total:0,same:0,oppo:0},
    atk:0, def:0, sup:0
    };

    return `
    <div class="card" data-id="${data.id}" data-link="issue.html?id=${data.id}">

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
        <div class="card-desc">${data.oneLine || ""}</div>

        <img src="${data.thumb || "assets/logo.png"}" class="card-thumb" />

        <div class="speech-btn" data-index="${data.id}">
          🎥 1분 엘리베이터 스피치
        </div>

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

        <!-- ⚔️ COMMENT WAR DASHBOARD -->
        <div class="war-dashboard goto-comments">
          <div class="war-title">⚔ 전황표</div>

          <div class="war-grid">
            <div class="war-box pro">
  <div class="war-label">찬성 진영</div>
  <div class="war-stat">총 댓글 <b class="stat-pro-total">${w.pro.total}</b></div>
  <div class="war-sub">
    동진영 <span class="stat-pro-same">${w.pro.same}</span> ·
    적진 <span class="stat-pro-oppo">${w.pro.oppo}</span>
  </div>
</div>

            <div class="war-box neutral">
            <div class="war-label">전체 전장</div>
            <div class="war-stat">총 교전 <b class="stat-total">${w.atk + w.def + w.sup}</b></div>
            <div class="war-sub">
                공격 <span class="stat-atk">${w.atk}</span> ·
                지원 <span class="stat-sup">${w.sup}</span> ·
                방어 <span class="stat-def">${w.def}</span>
            </div>
            </div>

            <div class="war-box con">
            <div class="war-label">반대 진영</div>
            <div class="war-stat">총 댓글 <b class="stat-con-total">${w.con.total}</b></div>
            <div class="war-sub">
                동진영 <span class="stat-con-same">${w.con.same}</span> ·
                적진 <span class="stat-con-oppo">${w.con.oppo}</span>
            </div>
            </div>
          </div>
        </div>

        <div class="card-footer">
            <div class="footer-icons">
                <img src="assets/icons/icon-comment.svg" class="goto-comments"/>
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

    // 👍👎 투표
    document.querySelectorAll(".vote-btn").forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();

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

    // 모달
    document.querySelectorAll(".open-modal").forEach(el => {
        el.onclick = e => {
            e.stopPropagation();
            openModal(el.dataset.msg);
        };
    });

    // ⚔️ 전황표 & 💬 댓글 아이콘 → 전쟁 위치로 이동
    document.querySelectorAll(".goto-comments").forEach(el => {
    el.onclick = e => {
        e.stopPropagation();

        const card = el.closest(".card");
        const id = card.dataset.id;

        location.href = `issue.html?id=${id}#battle-zone`;
    };
    });

    // 🧭 카드 전체 클릭 → 이슈 페이지
    document.querySelectorAll(".card").forEach(card => {
        card.addEventListener("click", () => {
            const url = card.dataset.link;
            if (url) location.href = url;
        });
    });

    // 🎥 1분 스피치 클릭
    document.querySelectorAll(".speech-btn").forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();

            speechList = cards.filter(c => c.video_url && c.video_url.trim() !== "");
            if (speechList.length === 0) {
                alert("등록된 영상이 없습니다.");
                return;
            }
            speechIndex = speechList.findIndex(c => c.id == btn.dataset.index);
            if (speechIndex === -1) speechIndex = 0;

            openSpeech();
        };
    });


}

// =========================================
// 🔥 DATA FETCH — CACHE SAFE MODE
// =========================================
async function loadData() {
    const supabase = window.supabaseClient;

    // 1️⃣ Issues
    const { data: issues, error } = await supabase
    .from("issues")
    .select(`
        id, title, one_line, description, category, created_at,
        pro_count, con_count,
        sup_pro, sup_con,
        user_id,
        thumbnail_url,
        video_url
    `)
        .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        return;
    }

    // 2️⃣ User Profiles
    const userIds = [...new Set(issues.map(i => i.user_id).filter(Boolean))];

    const { data: profiles } = await supabase
        .from("user_profiles")
        .select("user_id, nickname, level")
        .in("user_id", userIds);

    const profileMap = {};
    profiles?.forEach(p => profileMap[p.user_id] = p);

    // 3️⃣ Merge
    cards = issues.map(row => ({
        id: row.id,
        category: row.category,
        author: profileMap[row.user_id]?.nickname || "익명",
        level: profileMap[row.user_id]?.level || 1,
        time: new Date(row.created_at).toLocaleDateString(),
        title: row.title,
        oneLine: row.one_line,          // 🔥 추가
        desc: row.one_line,
        pro: row.pro_count,
        con: row.con_count,
        supPro: row.sup_pro,
        supCon: row.sup_con,
        thumb: row.thumbnail_url,
        video_url: row.video_url
    }));

    const issueIds = cards.map(c => c.id);
    const warMap = await loadWarData(issueIds);

    cards = cards.map(c => ({
        ...c,
        war: warMap[c.id]
    }));


    loadBest();
    loadRecommend();
}

// =========================================
// ⚔️ WAR DATA FETCHER
// =========================================
async function loadWarData(issueIds) {
    const supabase = window.supabaseClient;

    const { data, error } = await supabase
        .from("comments")
        .select("issue_id, stance, action_type")
        .in("issue_id", issueIds);

    if (error) {
        console.error("war data error:", error);
        return {};
    }

    const warMap = {};
    issueIds.forEach(id => {
        warMap[id] = {
            pro: { total: 0, same: 0, oppo: 0 },
            con: { total: 0, same: 0, oppo: 0 },
            atk: 0, def: 0, sup: 0
        };
    });

    data.forEach(row => {
        const w = warMap[row.issue_id];
        if (!w) return;

        const s = row.stance;
        w[s].total++;

        if (row.action_type === "attack") w.atk++;
        if (row.action_type === "defense") w.def++;
        if (row.action_type === "support") w.sup++;

        if (row.action_type === "attack") {
            if (s === "pro") w.pro.oppo++;
            else w.con.oppo++;
        } else {
            if (s === "pro") w.pro.same++;
            else w.con.same++;
        }
    });

    return warMap;
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

function openSpeech() {
    document.body.classList.add("shorts-mode");

    document.documentElement.scrollTop = 0;   // 🔥 배경 스크롤 강제 정지

    speechModal.classList.add("active");
    playSpeech();
}

function playSpeech() {
    const item = speechList[speechIndex];

    speechLoading.classList.remove("hidden");

    speechVideo.src = item.video_url;
    speechVideo.load();

    speechVideo.onloadeddata = () => {
        speechLoading.classList.add("hidden");
        speechVideo.play();
        preloadNext();   // 🔥 다음 영상 미리 로드
    };
}

function preloadNext() {
    const next = speechList[speechIndex + 1];
    if (!next) return;

    preloadVideo.src = next.video_url;
    preloadVideo.load();
}

// INIT
loadData();

function handleSpeechVote(type) {
    const current = speechList[speechIndex];

    if (!current || voteMemory[current.id]) return;

    const data = cards.find(c => c.id === current.id);

    if (type === "pro") data.pro++;
    else data.con++;

    voteMemory[current.id] = type;
    localStorage.setItem("votes", JSON.stringify(voteMemory));

    refreshCard(current.id);
}

document.addEventListener("DOMContentLoaded", () => {

    speechModal = document.getElementById("speech-modal");
    speechVideo = document.getElementById("speech-video");
    speechVideo.style.width = "100%";
    speechVideo.style.height = "100%";
    speechVideo.style.objectFit = "cover";
    speechVideo.style.position = "absolute";
    speechVideo.style.top = "0";
    speechVideo.style.left = "0";
    
    speechLoading = document.getElementById("speech-loading");

    const closeBtn = document.getElementById("speech-close");
    const proBtn = document.querySelector(".speech-actions .btn-pro");
    const conBtn = document.querySelector(".speech-actions .btn-con");

    preloadVideo = document.createElement("video");
    preloadVideo.muted = true;
    preloadVideo.playsInline = true;
    preloadVideo.preload = "auto";

    let startY = 0;
    let isLocked = false;

    speechVideo.addEventListener("touchstart", e => {
        startY = e.touches[0].clientY;
    });

    speechVideo.addEventListener("touchend", e => {
        if (isLocked) return;

        const endY = e.changedTouches[0].clientY;
        const diff = startY - endY;

        if (Math.abs(diff) < 160) return;   // 짧은 드래그 무시

        isLocked = true;

        if (diff > 0 && speechIndex < speechList.length - 1) {
            speechIndex++;
        } else if (diff < 0 && speechIndex > 0) {
            speechIndex--;
        }

        playSpeech();

        setTimeout(() => {
            isLocked = false;
        }, 600);
    });

    closeBtn.onclick = () => {
        speechVideo.pause();

        speechModal.classList.remove("active");
        document.body.classList.remove("shorts-mode");

        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
    };

});