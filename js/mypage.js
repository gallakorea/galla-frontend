document.addEventListener("DOMContentLoaded", () => {

    /* 네비 active */
    const current = document.body.dataset.page;
    document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.toggle("active", item.dataset.page === current);
    });

    /* 탭 */
    const tabs = document.querySelectorAll(".tab");
    const tabContent = document.getElementById("tabContent");

    const renderMy = () => {
        tabContent.innerHTML = `
            <div class="thumb-card">
                <img src="./assets/logo.png">
                <div class="thumb-title">연애비용 분담 논쟁 난리났네</div>
                <div class="thumb-author">by 익명의 사용자</div>
                <div class="thumb-stats">
                    <span>🔥 233</span>
                    <span>💥 102</span>
                    <span>💬 44</span>
                </div>
            </div>

            <div class="thumb-card">
                <img src="./assets/logo.png">
                <div class="thumb-title">직장 회식 강요… 이거 불법?</div>
                <div class="thumb-author">by 익명의 사용자</div>
                <div class="thumb-stats">
                    <span>🔥 301</span>
                    <span>💥 88</span>
                    <span>💬 29</span>
                </div>
            </div>
        `;
    };

    const renderBattle = () => {
        tabContent.innerHTML = `
            <div class="thumb-card">
                <img src="./assets/logo.png">
                <div class="thumb-title">🔥 도전 콘텐츠 #1</div>
                <div class="thumb-author">by 익명의 사용자</div>
                <div class="thumb-stats">
                    <span>🔥 77</span>
                    <span>💥 22</span>
                    <span>💬 11</span>
                </div>
            </div>
        `;
    };

    const renderSave = () => {
        tabContent.innerHTML = `
            <div class="thumb-card">
                <img src="./assets/logo.png">
                <div class="thumb-title">저장한 콘텐츠 #1</div>
                <div class="thumb-author">by 익명의 사용자</div>
                <div class="thumb-stats">
                    <span>🔥 122</span>
                    <span>💥 44</span>
                    <span>💬 12</span>
                </div>
            </div>
        `;
    };

    const renderFavorite = () => {
        tabContent.innerHTML = `
            <div style="color:#888;font-size:14px;padding:20px;">
                팔로우한 발의자를 준비 중…
            </div>
        `;
    };

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");

            const menu = tab.dataset.tab;

            if(menu === "my") renderMy();
            if(menu === "battle") renderBattle();
            if(menu === "save") renderSave();
            if(menu === "favorite") renderFavorite();
        });
    });

    /* 기본 표시 */
    renderMy();
});

document.addEventListener("DOMContentLoaded", () => {
    const currentPage = document.body.dataset.page;
    const navItems = document.querySelectorAll(".bottom-nav .nav-item");

    navItems.forEach(item => {
        item.classList.remove("active");
        if (item.dataset.page === currentPage) {
            item.classList.add("active");
        }
    });
});


document.addEventListener("DOMContentLoaded", () => {
    const current = document.body.dataset.page;
    document.querySelectorAll(".nav-item").forEach(item => {
        if (item.dataset.page === current) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });
});