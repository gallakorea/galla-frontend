document.addEventListener("DOMContentLoaded", () => {

    // ---------------------------
    // 현재 페이지 정보
    // ---------------------------
    const currentPage = document.body.dataset.page;

    // ---------------------------
    // 하단 네비 active 적용
    // ---------------------------
    document.querySelectorAll(".bottom-nav .nav-item").forEach(item => {
        item.classList.toggle("active", item.dataset.page === currentPage);
    });

    // ---------------------------
    // 상단 nav (필요한 경우만 적용)
    // ---------------------------
    document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.toggle("active", item.dataset.page === currentPage);
    });

    // ---------------------------
    // 탭 렌더링 요소
    // ---------------------------
    const tabs = document.querySelectorAll(".tab");
    const tabContent = document.getElementById("tabContent");

    // ---------------------------
    // tab 렌더링 함수들
    // ---------------------------
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

    // ---------------------------
    // 탭 클릭 이벤트
    // ---------------------------
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");

            const menu = tab.dataset.tab;

            switch (menu) {
                case "my": renderMy(); break;
                case "battle": renderBattle(); break;
                case "save": renderSave(); break;
                case "favorite": renderFavorite(); break;
            }
        });
    });

    // 기본 탭 로딩
    renderMy();
});