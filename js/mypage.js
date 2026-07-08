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

    // ============================
    // View User (self vs other)
    // ============================
    const params = new URLSearchParams(location.search);
    const viewUserId = params.get("user") || userId;
    const isMyPage = viewUserId === userId;

    // ============================
    // Profile Actions (Follow / Message) - Render dynamically
    // ============================
    const profileActions = document.getElementById("profileActions");
    profileActions.innerHTML = "";

    if (isMyPage) {
        const editBtn = document.createElement("button");
        editBtn.className = "action-btn primary";
        editBtn.textContent = "프로필 편집";
        editBtn.onclick = () => location.href = "account-edit.html";

        const missionBtn = document.createElement("button");
        missionBtn.className = "action-btn secondary";
        missionBtn.textContent = "오늘의 미션";
        missionBtn.onclick = () => location.href = "quest.html";

        profileActions.appendChild(editBtn);
        profileActions.appendChild(missionBtn);
    } else {
        const followBtn = document.createElement("button");
        followBtn.className = "action-btn primary";

        const messageBtn = document.createElement("button");
        messageBtn.className = "action-btn secondary";
        messageBtn.textContent = "메시지 보내기";

        const { data: followRow } = await supabase
            .from("follows")
            .select("id")
            .eq("follower", userId)
            .eq("following", viewUserId)
            .maybeSingle();

        let isFollowing = !!followRow;
        followBtn.textContent = isFollowing ? "언팔로우" : "팔로우";

        followBtn.onclick = async () => {
            if (isFollowing) {
                await supabase.from("follows")
                    .delete()
                    .eq("follower", userId)
                    .eq("following", viewUserId);
            } else {
                await supabase.from("follows")
                    .insert({ follower: userId, following: viewUserId });
            }
            location.reload();
        };

        messageBtn.onclick = () => alert("메시지 기능은 준비 중입니다.");

        profileActions.appendChild(followBtn);
        profileActions.appendChild(messageBtn);
    }

    // ============================
    // Load viewed user's profile data (nickname, bio, level, avatar_url)
    // ============================
    const { data: viewProfile, error: viewProfileError } = await supabase
        .from("users")
        .select("nickname, bio, level, avatar_url")
        .eq("id", viewUserId)
        .single();

    if (!viewProfileError && viewProfile) {
        const nameEl = document.getElementById("profileName");
        const descEl = document.getElementById("profileDesc");
        const levelEl = document.getElementById("levelText");
        const profileImg = document.getElementById("profileImg");

        if (nameEl) nameEl.textContent = viewProfile.nickname || "익명의 사용자";
        if (descEl) descEl.textContent = viewProfile.bio || "소개 문구가 없습니다.";
        if (levelEl) levelEl.textContent = "Lv. " + (viewProfile.level || 1);

        if (profileImg) {
            if (viewProfile.avatar_url) {
                const { data, error } = supabase
                    .storage
                    .from("profiles")
                    .getPublicUrl(viewProfile.avatar_url);

                if (!error && data?.publicUrl) {
                    // 🔥 캐시 무효화 파라미터 필수
                    profileImg.src = `${data.publicUrl}?t=${Date.now()}`;
                } else {
                    profileImg.src = "assets/logo.png";
                }
            } else {
                profileImg.src = "assets/logo.png";
            }
        }
    }

    // =====================================================
    // Load My Stats
    // =====================================================
    async function loadMyStats() {
        // 1) My Drop: count of issues where user_id = viewUserId
        const { count: dropCount, error: dropError } = await supabase
            .from("issues")
            .select("id", { count: "exact", head: true })
            .eq("user_id", viewUserId);

        // 2) Followers: count of follows where following = viewUserId
        const { count: followerCount, error: followerError } = await supabase
            .from("follows")
            .select("id", { count: "exact", head: true })
            .eq("following", viewUserId);

        // 3) 내가 만든 이슈 id 목록
        const { data: myIssues, error: myIssuesError } = await supabase
            .from("issues")
            .select("id")
            .eq("user_id", viewUserId);

        const myIssueIds = (myIssues || []).map(i => i.id);

        // 4) Supports (찬성): votes.type = 'pro'
        let supportSum = 0;
        if (myIssueIds.length > 0) {
            const { count } = await supabase
                .from("votes")
                .select("id", { count: "exact", head: true })
                .in("issue_id", myIssueIds)
                .eq("type", "pro");
            supportSum = count || 0;
        }

        // 5) Opposes (반발): votes.type = 'con'
        let opposeSum = 0;
        if (myIssueIds.length > 0) {
            const { count } = await supabase
                .from("votes")
                .select("id", { count: "exact", head: true })
                .in("issue_id", myIssueIds)
                .eq("type", "con");
            opposeSum = count || 0;
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
            .eq("user_id", viewUserId)
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
                <div class="thumb-author">${isMyPage ? "by 나" : "by 사용자"}</div>
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
            .eq("user_id", viewUserId);

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

    // =====================================================
    // Save 갈라 — 내가 북마크한 이슈
    // =====================================================
    const renderSave = async () => {
        if (!isMyPage) {
            tabContent.innerHTML = `
                <div style="color:#777;font-size:14px;padding:20px;">
                    저장한 갈라는 본인만 볼 수 있습니다.
                </div>
            `;
            return;
        }

        tabContent.innerHTML = `<div style="color:#777">불러오는 중...</div>`;

        const { data: bookmarks, error: bmError } = await supabase
            .from("bookmarks")
            .select("issue_id, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });

        if (bmError) {
            console.error("[Save Galla] bookmarks error", bmError);
            tabContent.innerHTML = `<div style="color:#777">불러오기 실패</div>`;
            return;
        }

        if (!bookmarks || bookmarks.length === 0) {
            tabContent.innerHTML = `
                <div style="color:#777;font-size:14px;padding:20px;">
                    저장한 갈라가 없습니다. 피드에서 북마크 아이콘을 눌러 저장해보세요.
                </div>
            `;
            return;
        }

        const issueIds = bookmarks.map(b => b.issue_id);
        const { data: issues, error: issueError } = await supabase
            .from("issues")
            .select("id, title, score, thumbnail_url")
            .in("id", issueIds);

        if (issueError) {
            console.error("[Save Galla] issues error", issueError);
            tabContent.innerHTML = `<div style="color:#777">불러오기 실패</div>`;
            return;
        }

        const issueMap = {};
        (issues || []).forEach(i => issueMap[i.id] = i);

        tabContent.innerHTML = "";

        issueIds.forEach(id => {
            const issue = issueMap[id];
            if (!issue) return; // 삭제된 이슈

            const card = document.createElement("div");
            card.className = "thumb-card";
            card.innerHTML = `
                <img src="${issue.thumbnail_url || "./assets/logo.png"}">
                <div class="thumb-title">${issue.title}</div>
                <div class="thumb-author">🔖 저장한 갈라</div>
                <div class="thumb-stats">
                    <span>🔥 ${issue.score ?? 0}</span>
                </div>
            `;
            card.onclick = () => location.href = `issue.html?id=${issue.id}`;
            tabContent.appendChild(card);
        });
    };

    // =====================================================
    // 즐겨찾기 — 팔로우한 사용자
    // =====================================================
    const renderFavorite = async () => {
        tabContent.innerHTML = `<div style="color:#777">불러오는 중...</div>`;

        const { data: follows, error: followError } = await supabase
            .from("follows")
            .select("following")
            .eq("follower", viewUserId)
            .order("created_at", { ascending: false });

        if (followError) {
            console.error("[Favorite] follows error", followError);
            tabContent.innerHTML = `<div style="color:#777">불러오기 실패</div>`;
            return;
        }

        if (!follows || follows.length === 0) {
            tabContent.innerHTML = `
                <div style="color:#777;font-size:14px;padding:20px;">
                    팔로우한 사용자가 없습니다.
                </div>
            `;
            return;
        }

        const followingIds = follows.map(f => f.following);
        const { data: followUsers, error: usersError } = await supabase
            .from("users")
            .select("id, nickname, level, avatar_url")
            .in("id", followingIds);

        if (usersError) {
            console.error("[Favorite] users error", usersError);
            tabContent.innerHTML = `<div style="color:#777">불러오기 실패</div>`;
            return;
        }

        const userMap = {};
        (followUsers || []).forEach(u => userMap[u.id] = u);

        tabContent.innerHTML = "";

        followingIds.forEach(fid => {
            const u = userMap[fid];
            if (!u) return;

            let avatarSrc = "assets/logo.png";
            if (u.avatar_url) {
                const { data: pub } = supabase.storage
                    .from("profiles")
                    .getPublicUrl(u.avatar_url);
                if (pub?.publicUrl) avatarSrc = `${pub.publicUrl}?t=${Date.now()}`;
            }

            const row = document.createElement("div");
            row.className = "user-row";
            row.innerHTML = `
                <img class="user-row-avatar" src="${avatarSrc}">
                <div class="user-row-info">
                    <div class="user-row-name">${u.nickname || "익명의 사용자"}</div>
                    <div class="user-row-level">Lv. ${u.level || 1}</div>
                </div>
            `;
            row.onclick = () => location.href = `mypage.html?user=${u.id}`;
            tabContent.appendChild(row);
        });
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