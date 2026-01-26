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
    // Load My Stats
    // =====================================================
    async function loadMyStats() {
        // 1) My Drop: count of issues where user_id = userId
        const { count: dropCount, error: dropError } = await supabase
            .from("issues")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId);

        // 2) Followers: count of follows where following = userId
        const { count: followerCount, error: followerError } = await supabase
            .from("follows")
            .select("id", { count: "exact", head: true })
            .eq("following", userId);

        // 3) Supports (찬성): sum of sup_pro from issues where user_id = userId
        const { data: supportData, error: supportError } = await supabase
            .from("issues")
            .select("sup_pro", { head: false })
            .eq("user_id", userId);
        let supportSum = 0;
        if (supportData && Array.isArray(supportData)) {
            supportSum = supportData.reduce((acc, row) => acc + (row.sup_pro || 0), 0);
        }

        // 4) Opposes (반대): sum of sup_con from issues where user_id = userId
        const { data: opposeData, error: opposeError } = await supabase
            .from("issues")
            .select("sup_con", { head: false })
            .eq("user_id", userId);
        let opposeSum = 0;
        if (opposeData && Array.isArray(opposeData)) {
            opposeSum = opposeData.reduce((acc, row) => acc + (row.sup_con || 0), 0);
        }

        // Update DOM elements (fallback to 0)
        const setStat = (selector, value) => {
            const el = document.querySelector(selector);
            if (el) el.textContent = value ?? 0;
        };
        setStat("#statDrop", dropCount ?? 0);
        setStat("#statFollowers", followerCount ?? 0);
        setStat("#statSupports", supportSum ?? 0);
        setStat("#statOppose", opposeSum ?? 0);
    }

    // Load stats before initial render
    loadMyStats();

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
                thumbnail_url
            `)
            .eq("user_id", userId)
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

            const thumbSrc = issue.thumbnail_url
                ? issue.thumbnail_url
                : "./assets/logo.png";

            card.innerHTML = `
                <img src="${thumbSrc}">
                <div class="thumb-title">${issue.title}</div>
                <div class="thumb-author">by 나</div>
                <div class="thumb-stats">
                    <span>🔥 ${issue.score ?? 0}</span>
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
    const renderBattle = async () => {
        tabContent.innerHTML = `<div style="color:#777">불러오는 중...</div>`;

        // 1) 내가 만든 원본 이슈 id 목록
        const { data: myIssues, error: myIssuesError } = await supabase
            .from("issues")
            .select("id, title, thumbnail_url")
            .eq("user_id", userId);

        if (myIssuesError) {
            console.error("[Battle Galla] my issues error", myIssuesError);
            tabContent.innerHTML = `<div style="color:#777">불러오기 실패</div>`;
            return;
        }

        if (!myIssues || myIssues.length === 0) {
            tabContent.innerHTML = `
                <div style="color:#777;font-size:14px;padding:20px;">
                    아직 배틀이 발생한 이슈가 없습니다.
                </div>
            `;
            return;
        }

        const myIssueIds = myIssues.map(i => i.id);

        // 2) 내 이슈에 참전된 배틀 이슈 조회 (명시적 battle_type 기준)
        const { data: battleIssues, error: battleError } = await supabase
            .from("issues")
            .select(`
                id,
                title,
                thumbnail_url,
                origin_issue_id,
                battle_type,
                score
            `)
            // battle 판단 기준: origin_issue_id 존재 여부 (legacy 데이터 호환)
            .in("origin_issue_id", myIssueIds)
            .neq("user_id", userId);

        if (battleError) {
            console.error("[Battle Galla] battle issues error", battleError);
            tabContent.innerHTML = `<div style="color:#777">불러오기 실패</div>`;
            return;
        }

        if (!battleIssues || battleIssues.length === 0) {
            tabContent.innerHTML = `
                <div style="color:#777;font-size:14px;padding:20px;">
                    아직 배틀이 발생한 이슈가 없습니다.
                </div>
            `;
            return;
        }

        tabContent.innerHTML = "";

        battleIssues.forEach(battle => {
            const origin = myIssues.find(i => i.id === battle.origin_issue_id);

            const card = document.createElement("div");
            card.className = "thumb-card";

            card.innerHTML = `
                <img src="${origin?.thumbnail_url || "./assets/logo.png"}">
                <div class="thumb-title">${origin?.title || "Battle Issue"}</div>
                <div class="thumb-author">⚔️ 참전 발생</div>
                <div class="thumb-stats">
                    <span>🔥 ${battle.score ?? 0}</span>
                </div>
            `;

            card.onclick = () => {
                location.href = `issue.html?id=${battle.origin_issue_id}`;
            };

            tabContent.appendChild(card);
        });
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