/* --------------------------
   1) SLOT 데이터
--------------------------- */
const SLOT1 = [
    {short:"정치", full:"정치·사회"},
    {short:"사회", full:"사회 이슈"},
    {short:"경제", full:"경제·투자"},
    {short:"직장", full:"직장·경력"},
    {short:"연애", full:"연애·결혼"},
    {short:"일상", full:"생활·일상"},
    {short:"패션", full:"패션·뷰티"},
    {short:"여행", full:"세계·여행"},
    {short:"음식", full:"음식·맛집"},
    {short:"19금", full:"19금 이슈"}
];
const SLOT2 = [
    {short:"월급", full:"월급 문제"},
    {short:"소비", full:"과소비 논쟁"},
    {short:"갈등", full:"직장 갈등"},
    {short:"젠더", full:"젠더 이슈"},
    {short:"발언", full:"발언 논란"},
    {short:"범죄", full:"범죄 문제"},
    {short:"치안", full:"치안 불안"},
    {short:"차별", full:"차별 논란"},
    {short:"기후", full:"기후 위기"},
    {short:"부담", full:"부담 증가"}
];
const SLOT3 = [
    {short:"세대", full:"세대 갈등"},
    {short:"남녀", full:"남녀 갈등"},
    {short:"갑을", full:"갑을 문제"},
    {short:"정의", full:"정의 논쟁"},
    {short:"안전", full:"안전 우려"},
    {short:"윤리", full:"윤리적 논쟁"},
    {short:"가치", full:"가치 충돌"},
    {short:"불만", full:"사회적 불만"},
    {short:"논쟁", full:"사회 논쟁"},
    {short:"위험", full:"위험 증가"}
];

/* DOM */
const slot1 = document.getElementById("slot1");
const slot2 = document.getElementById("slot2");
const slot3 = document.getElementById("slot3");
const resultArea = document.getElementById("resultArea");
const feedArea = document.getElementById("randomFeed");
const randomBtn = document.getElementById("randomBtn");
const floatingRandom = document.getElementById("floatingRandom");


/* ===================================================================
   ⭐ index 카드 UI 원본 그대로 유지
=================================================================== */
function renderIndexCard(data) {
    return `
    <div class="card" data-id="${data.id}">

        <div class="card-top">
            <span>${data.category}</span>
            <span>${data.time}</span>
        </div>

        <div class="card-author">
            <span class="author-name">${data.author}</span>
            <button class="follow-btn">+ 팔로우</button>
        </div>

        <div class="card-title">${data.title}</div>

        <div class="card-desc">${data.desc}</div>

        <img src="assets/logo.png" class="card-thumb" />

        <div class="speech-btn">🎥 1분 엘리베이터 스피치</div>

        <div class="vote-title">👍 찬반 투표 현황</div>

        <div class="vote-bar">
            <div class="vote-pro" style="width:${data.pro}%"></div>
            <div class="vote-con" style="width:${100 - data.pro}%"></div>
        </div>

        <div class="vote-stats">
            <span>${data.pro}%</span>
            <span>${100 - data.pro}%</span>
        </div>

        <div class="vote-buttons">
            <button class="btn-pro">👍 찬성이오</button>
            <button class="btn-con">👎 난 반댈세</button>
        </div>

        <div class="support-box">
            <div class="support-title">⚔️ 후원 전쟁 현황</div>

            <div class="support-bar">
                <div class="sup-pro" style="width:${data.supPro}%"></div>
                <div class="sup-con" style="width:${100 - data.supPro}%"></div>
            </div>

            <div class="support-stats">
                <span>₩${data.supProText}</span>
                <span>₩${data.supConText}</span>
            </div>

            <div class="support-btn">⚔️ 이 이슈 후원하기</div>
        </div>

        <div class="card-footer">
            <div class="footer-icons">
                <img src="assets/icons/icon-comment.svg"/>
                <img src="assets/icons/icon-bookmark.svg"/>
                <img src="assets/icons/icon-share.svg"/>
            </div>
            <button class="more-btn">• • •</button>
        </div>

    </div>`;
}


/* -------------------------- */
function pick(arr) {
    return arr[Math.floor(Math.random()*arr.length)];
}

function haptic() {
    if (navigator.vibrate) navigator.vibrate(40);
}


/* --------------------------
   SLOT 스핀
--------------------------- */
async function spinSlot(el, arr, delay) {
    return new Promise(resolve => {
        let interval = setInterval(() => {
            el.textContent = pick(arr).short;
        }, 80);

        setTimeout(() => {
            clearInterval(interval);
            const final = pick(arr);
            el.textContent = final.short;
            resolve(final);
        }, delay);
    });
}


/* --------------------------
   화두 카드
--------------------------- */
function makeTopicCard(a, b, c) {
    return `
    <div class="topic-card">
        <div style="font-weight:700; font-size:15px; margin-bottom:8px">
            ${a.full} / ${b.full} / ${c.full}
        </div>
        <div style="font-size:13px; line-height:1.5; color:#ccc">
            ${a.full} 분야에서 촉발된 ‘${b.full}’ 문제가 커지며 ${c.full}이 확산되고 있습니다.<br>
            이 문제를 어떻게 바라보십니까?
        </div>
    </div>`;
}


/* ===================================================================
   ⭐ 메인 랜덤 실행 (슬롯 → 화두 → 피드)
=================================================================== */
async function randomPick() {

    haptic();

    const r1 = await spinSlot(slot1, SLOT1, 500);
    const r2 = await spinSlot(slot2, SLOT2, 800);
    const r3 = await spinSlot(slot3, SLOT3, 1100);

    resultArea.innerHTML = makeTopicCard(r1, r2, r3);

    feedArea.innerHTML = "";

    for (let i = 0; i < 5; i++) {
        const d = {
            id: Date.now() + i,
            category: r1.full,
            time: "방금 전",
            author: "익명의 사용자",
            title: `${r2.full} 관련 논쟁`,
            desc: `${r2.full} 문제로 인해 논쟁이 확산되고 있습니다.`,
            pro: 50,
            supPro: 60,
            supProText: "120,000",
            supConText: "80,000"
        };

        feedArea.innerHTML += renderIndexCard(d);
    }
}


/* ===================================================================
   ⭐ 즉시 랜덤 버튼 핵심 수정 (여기서 다 해결됨)
=================================================================== */

/* 
즉시 랜덤 버튼 누름 → 페이지 최상단 이동
→ 최상단 도착 감지 → 자동 randomPick()
*/
floatingRandom.addEventListener("click", () => {

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

    const watcher = setInterval(() => {
        if (window.scrollY === 0) {
            clearInterval(watcher);
            randomPick();   // ★★★ 최상단 도착 후 자동 실행
        }
    }, 50);
});


/* 일반 RANDOM 버튼 */
randomBtn.onclick = randomPick;


/* ===================================================================
   ⭐ 즉시 랜덤 버튼 표시 조건
=================================================================== */
window.addEventListener("scroll", () => {
    const btnY = randomBtn.getBoundingClientRect().bottom;

    if (btnY < 0) floatingRandom.classList.remove("hidden");
    else floatingRandom.classList.add("hidden");
});


/* ===================================================================
   ⭐ 무한 스크롤 — index 카드 UI 그대로
=================================================================== */
window.addEventListener("scroll", () => {

    if (window.innerHeight + window.scrollY + 300 >= document.body.offsetHeight) {

        const a = pick(SLOT1);
        const b = pick(SLOT2);

        const d = {
            id: Date.now(),
            category: a.full,
            time: "방금 전",
            author: "익명의 사용자",
            title: `${b.full} 관련 논쟁`,
            desc: `${b.full} 문제로 인해 논쟁이 이어지고 있습니다.`,
            pro: 45,
            supPro: 55,
            supProText: "98,000",
            supConText: "76,000"
        };

        feedArea.innerHTML += renderIndexCard(d);
    }
});