document.addEventListener("DOMContentLoaded", async () => {

    // ---------------------------
    // Supabase client 확보 (UMD bootstrap 대응)
    // ---------------------------
    const supabase = await waitForSupabaseClient();

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
    // 탭 요소
    // ---------------------------
    const tabs = document.querySelectorAll(".tab");
    const tabContent = document.getElementById("tabContent");

    // ---------------------------
    // 로그인 세션 확보
    // ---------------------------
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;

    if (!session?.user) {
        alert("로그인이 필요합니다.");
        location.href = "login.html";
        return;
    }

    const userId = session.user.id;

    // =====================================================
    // My 갈라 — 내가 만든 이슈
    // =====================================================
    const renderMy = async () => {
        tabContent.innerHTML = `<div style="color:#777">불러오는 중...</div>`;

        const { data: issues, error } = await supabase
            .from("issues")
            .select(`
                id,
                title,
                created_at,
                score,
                comment_count
            `)
            .eq("author_id", userId)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("[My Galla] error", error);
            tabContent.innerHTML = `<div style="color:#777">불러오기 실패</div>`;
            return;
        }

        if (!issues || issues.length === 0) {
            tabContent.innerHTML = `
                <div style="color:#777;font-size:14px;padding:20px;">
                    아직 발의한 이슈가 없습니다.
                </div>
            `;
            return;
        }

        tabContent.innerHTML = "";

        issues.forEach(issue => {
            const card = document.createElement("div");
            card.className = "thumb-card";

            card.innerHTML = `
                <img src="./assets/logo.png">
                <div class="thumb-title">${issue.title}</div>
                <div class="thumb-author">by 나</div>
                <div class="thumb-stats">
                    <span>🔥 ${issue.score ?? 0}</span>
                    <span>💬 ${issue.comment_count ?? 0}</span>
                </div>
            `;

            card.onclick = () => {
                location.href = `issue.html?id=${issue.id}`;
            };

            tabContent.appendChild(card);
        });
    };

    // =====================================================
    // Battle / Save / Favorite (아직 더미 유지)
    // =====================================================
    const renderBattle = () => {
        tabContent.innerHTML = `
            <div style="color:#777;font-size:14px;padding:20px;">
                Battle 갈라 준비 중
            </div>
        `;
    };

    const renderSave = () => {
        tabContent.innerHTML = `
            <div style="color:#777;font-size:14px;padding:20px;">
                Save 갈라 준비 중
            </div>
        `;
    };

    const renderFavorite = () => {
        tabContent.innerHTML = `
            <div style="color:#777;font-size:14px;padding:20px;">
                즐겨찾기 준비 중
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

    // ---------------------------
    // 기본 탭
    // ---------------------------
    renderMy();
});