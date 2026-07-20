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
    // 헤더 & 탭: 내 프로필 vs 방문자 뷰 분기
    // ============================
    // 남의 프로필도 '원래 마이페이지'와 같은 크롬으로 본다 — 커스텀 헤더 교체(뒤로/⋯공유)는
    // 앱 전체 문법과 어긋나 '이상한 페이지'처럼 보여서 폐기. 데이터 분기(비공개 숨김)만 유지.
    document.body.classList.add(isMyPage ? "mp-self" : "mp-other");
    if (window.initNotifications) window.initNotifications();
    if (!isMyPage) {
        // 방문자에게 비공개 탭 숨김 (뉴스=저장한 뉴스는 본인만). 갈라/예측/광장은 공개 My만.
        ["news"].forEach(t => {
            document.querySelector(`.tab[data-tab="${t}"]`)?.setAttribute("hidden", "");
        });
    }

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

        /* 상점 직행 — 기존엔 설정 안까지 들어가야 했다(사장님 UX 지적) */
        const shopBtn = document.createElement("button");
        shopBtn.className = "action-btn secondary";
        shopBtn.textContent = "🛒 상점";
        shopBtn.onclick = () => window.openShop ? window.openShop() : (location.href = "settings.html");

        profileActions.appendChild(editBtn);
        profileActions.appendChild(missionBtn);
        profileActions.appendChild(shopBtn);
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

        messageBtn.onclick = () => {
            const name = document.getElementById("profileName")?.textContent || "";
            if (window.startDM) window.startDM(viewUserId, name);
        };

        /* ⚔️ 일기토 신청 버튼 제거 — 일기토는 '논쟁 중인 댓글'에서만 신청한다.
           프로필에서 아무한테나 도전하는 구조가 아님(사장님 룰). 전적 열람은 별개. */
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

        if (nameEl) {
            nameEl.textContent = viewProfile.nickname || "익명의 사용자";
            nameEl.setAttribute("data-nick-uid", viewUserId);   // 꾸미기 도색 대상
        }
        const hdrTitle = document.getElementById("mpHdrTitle");
        if (hdrTitle) hdrTitle.textContent = viewProfile.nickname || "프로필";
        if (descEl) descEl.textContent = viewProfile.bio || "소개 문구가 없습니다.";
        const lv = viewProfile.level || 1;
        if (levelEl) levelEl.textContent = "Lv. " + lv;
        // 아바타 위 등급 칩 — 갈라리안 등급표(GI)와 일치 (grade 페이지와 동일 기준)
        const tierChip = document.getElementById("tierChip");
        if (tierChip) {
            tierChip.textContent = "🌱";   // GI 로딩 전 기본
            (async () => {
                try {
                    const { data: giMap } = await supabase.rpc("gi_of_users", { p_uids: [viewUserId] });
                    const t = window.GALLA_gallianTier ? window.GALLA_gallianTier((giMap || {})[viewUserId] || 0) : { icon: "🌱" };
                    tierChip.textContent = t.icon;
                    tierChip.title = t.label;
                } catch (_) {}
            })();
        }
        // 전투력 = 이 유저가 벌인 전투 액션(공격/방어/지원) 총량
        (async () => {
            const powerEl = document.getElementById("powerText");
            if (!powerEl) return;
            const { count } = await supabase
                .from("comment_actions")
                .select("id", { count: "exact", head: true })
                .eq("user_id", viewUserId);
            powerEl.textContent = `⚡ 전투력 ${(count ?? 0).toLocaleString()}`;
        })();
        const badgeEl = document.getElementById("badgeText");
        if (badgeEl) {
            if (isMyPage) badgeEl.textContent = "🎯 오늘의 미션";
            else badgeEl.hidden = true; // 미션 배지는 본인 전용
        }

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

    // 발의자 후원 수익 카드 (내 프로필 & 받은 후원이 있을 때만)
    if (isMyPage && window.GALLA_renderEarnings) window.GALLA_renderEarnings();

    // =====================================================
    // My 갈라 — 내가 만든 이슈
    // =====================================================
    const renderMy = async () => {
        tabContent.className = "content-area";
        tabContent.innerHTML = `<div style="color:#777">불러오는 중...</div>`;

        const { data: issues, error } = await supabase
            .from("issues")
            .select(`
                id,
                title,
                created_at,
                score,
                thumbnail_url,
                card_thumb_url,
                images,
                video_url
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

        // 인스타식 3열 정사각 그리드(igCard) — 다른 탭과 통일
        tabContent.className = "content-area grid";
        tabContent.innerHTML = "";

        const qvItems = issues.map(i => ({ type: "issue", id: i.id }));
        issues.forEach((issue, myIdx) => {
            const firstImg = Array.isArray(issue.images) && issue.images.length ? issue.images[0] : null;
            tabContent.appendChild(igCard({
                thumb: issue.card_thumb_url || issue.thumbnail_url || firstImg || null,
                title: issue.title,
                badge: issue.video_url ? "▶" : "",
                onClick: () => openQvList(qvItems, myIdx)   // 이탈 금지 — 마이페이지 내 퀵뷰로 소비
            }));
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

            card.onclick = () => openQvList([{ type: "issue", id: battle.origin_issue_id }], 0); // 이탈 금지 — 퀵뷰

            tabContent.appendChild(card);
        });
    };

    // =====================================================
    // 퀵뷰 모달 — 그리드 클릭 시 페이지 이탈 없이 미리보기
    // =====================================================
    // 퀵뷰 탐색 상태: 현재 탭의 아이템 목록 + 위치
    let QV_ITEMS = [];   // [{type:'issue'|'news'|'plaza', id}]
    let QV_INDEX = 0;
    let qvDirty = false; // 퀵뷰에서 저장 해제 등 변경 발생 → 닫을 때 탭 새로고침

    function closeQuickView() {
        const qv = document.getElementById("mpQuickView");
        if (!qv) return;
        qv.classList.remove("open");
        document.body.style.overflow = "";
        if (qvDirty) {
            qvDirty = false;
            document.querySelector(".tab.active")?.click(); // 현재 탭 재렌더
            loadTabCounts(); // 탭 카운트 갱신
        }
    }

    function qvStep(dir) {
        const next = QV_INDEX + dir;
        if (next < 0 || next >= QV_ITEMS.length) return;
        QV_INDEX = next;
        showQvCurrent();
    }

    function showQvCurrent() {
        const it = QV_ITEMS[QV_INDEX];
        if (!it) return;
        if (it.type === "issue") quickViewIssue(it.id);
        else if (it.type === "news") quickViewNews(it.id);
        else if (it.type === "plaza") quickViewPlaza(it.id);
        else if (it.type === "market") quickViewMarket(it.id);
    }

    function openQvList(items, index) {
        QV_ITEMS = items;
        QV_INDEX = index;
        showQvCurrent();
    }

    // 공용 아이콘 SVG — 전 페이지 통일
    const BM_ICON = '<svg class="ic-bookmark" viewBox="0 0 24 24"><path d="M18 21l-6-4.3L6 21V5.5A2.5 2.5 0 0 1 8.5 3h7A2.5 2.5 0 0 1 18 5.5V21z"/></svg>';
    const SHARE_ICON = '<svg class="ic-share" viewBox="0 0 24 24"><path d="M21.5 2.5L10.8 13.2"/><path d="M21.5 2.5l-6.8 19-3.9-8.3-8.3-3.9 19-6.8z"/></svg>';

    function ensureQuickView() {
        let qv = document.getElementById("mpQuickView");
        if (qv) return qv;
        qv = document.createElement("div");
        qv.id = "mpQuickView";
        qv.innerHTML = `
            <div class="qv-dim"></div>
            <div class="qv-card">
                <button class="qv-close" aria-label="닫기">✕</button>
                <button class="qv-nav qv-prev" aria-label="이전">‹</button>
                <button class="qv-nav qv-next" aria-label="다음">›</button>
                <div class="qv-media"></div>
                <div class="qv-body">
                    <div class="qv-cat"></div>
                    <div class="qv-title"></div>
                    <div class="qv-desc"></div>
                    <div class="qv-stats"></div>
                    <div class="qv-actions"></div>
                    <button class="qv-go"></button>
                </div>
            </div>`;
        document.body.appendChild(qv);
        qv.querySelector(".qv-dim").onclick = closeQuickView;
        qv.querySelector(".qv-close").onclick = closeQuickView;
        qv.querySelector(".qv-prev").onclick = () => qvStep(-1);
        qv.querySelector(".qv-next").onclick = () => qvStep(1);

        // 좌우 스와이프로 이전/다음 (세로 스크롤과 구분)
        const card = qv.querySelector(".qv-card");
        let tx = 0, ty = 0;
        card.addEventListener("touchstart", e => {
            tx = e.touches[0].clientX; ty = e.touches[0].clientY;
        }, { passive: true });
        card.addEventListener("touchend", e => {
            const dx = e.changedTouches[0].clientX - tx;
            const dy = e.changedTouches[0].clientY - ty;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                qvStep(dx < 0 ? 1 : -1);
            }
        }, { passive: true });

        // 키보드 ← → / ESC
        document.addEventListener("keydown", e => {
            if (!qv.classList.contains("open")) return;
            if (e.key === "ArrowLeft") qvStep(-1);
            if (e.key === "ArrowRight") qvStep(1);
            if (e.key === "Escape") closeQuickView();
        });
        return qv;
    }

    function openQuickView({ mediaHtml, cat, title, desc, stats, goLabel, goHref, actions }) {
        const qv = ensureQuickView();
        qv.querySelector(".qv-media").innerHTML = mediaHtml || "";
        qv.querySelector(".qv-cat").textContent = cat || "";
        qv.querySelector(".qv-title").textContent = title || "";
        qv.querySelector(".qv-desc").textContent = desc || "";
        qv.querySelector(".qv-stats").innerHTML = stats || "";

        // 액션 버튼 (좋아요/저장 등)
        const actWrap = qv.querySelector(".qv-actions");
        actWrap.innerHTML = "";
        (actions || []).forEach(a => {
            const b = document.createElement("button");
            b.className = "qv-act" + (a.active ? " on" : "");
            b.innerHTML = a.label;
            b.onclick = async () => {
                b.disabled = true;
                try { await a.onClick(b); } finally { b.disabled = false; }
            };
            actWrap.appendChild(b);
        });
        // 공유 버튼 (항상, 저장 옆)
        const shareBtn = document.createElement("button");
        shareBtn.className = "qv-act qv-share";
        shareBtn.innerHTML = SHARE_ICON + '<span class="qv-act-txt">공유</span>';
        shareBtn.onclick = async () => {
            const url = new URL(goHref, location.href).href;
            if (navigator.share) {
                try { await navigator.share({ title: title || "GALLA", url }); return; }
                catch (err) { if (err.name === "AbortError") return; }
            }
            try { await navigator.clipboard.writeText(url); alert("링크가 복사되었습니다."); }
            catch { alert("링크 복사에 실패했습니다."); }
        };
        actWrap.appendChild(shareBtn);

        const go = qv.querySelector(".qv-go");
        go.textContent = goLabel || "원본으로 이동";
        go.onclick = () => location.href = goHref;

        // 이전/다음 버튼 표시 여부
        qv.querySelector(".qv-prev").style.visibility = QV_INDEX > 0 ? "visible" : "hidden";
        qv.querySelector(".qv-next").style.visibility = QV_INDEX < QV_ITEMS.length - 1 ? "visible" : "hidden";

        qv.classList.add("open");
        document.body.style.overflow = "hidden";
    }

    const qvImg = (src) => src
        ? `<img src="${src}" onerror="this.src='./assets/logo.png'">`
        : `<img src="./assets/logo.png">`;

    // 타입별 퀵뷰 (필요 데이터 lazy 조회)
    async function quickViewIssue(issueId) {
        const [{ data: i }, { data: bm }] = await Promise.all([
            supabase.from("issues")
                .select("id,title,category,thumbnail_url,images,video_url,pro_count,con_count,faction_a,faction_b")
                .eq("id", issueId).maybeSingle(),
            supabase.from("bookmarks")
                .select("issue_id").eq("user_id", userId).eq("issue_id", issueId).maybeSingle()
        ]);
        if (!i) { location.href = `issue.html?id=${issueId}`; return; }
        const thumb = i.thumbnail_url || (Array.isArray(i.images) && i.images[0]) || null;
        const media = i.video_url
            ? `<video src="${i.video_url}" controls playsinline preload="metadata"></video>`
            : qvImg(thumb);

        let saved = !!bm;
        openQuickView({
            mediaHtml: media,
            cat: i.category || "",
            title: i.title,
            desc: "",
            stats: `<span>${i.faction_a || "찬성"} ${i.pro_count || 0}</span> · <span>${i.faction_b || "반대"} ${i.con_count || 0}</span>`,
            actions: [{
                label: BM_ICON + '<span class="qv-act-txt">' + (saved ? "저장됨" : "저장") + '</span>',
                active: saved,
                onClick: async (btn) => {
                    if (saved) {
                        await supabase.from("bookmarks").delete()
                            .eq("user_id", userId).eq("issue_id", issueId);
                    } else {
                        await supabase.from("bookmarks").insert({ user_id: userId, issue_id: issueId });
                    }
                    saved = !saved;
                    btn.querySelector(".qv-act-txt").textContent = saved ? "저장됨" : "저장";
                    btn.classList.toggle("on", saved);
                    qvDirty = true;
                }
            }],
            goLabel: "이슈에서 참전하기",
            goHref: `issue.html?id=${i.id}`
        });
    }

    async function quickViewNews(newsId) {
        const [{ data: n }, { data: bm }, { data: rx }] = await Promise.all([
            supabase.from("galla_news")
                .select("id,title,summary,category,hero_image,source_count")
                .eq("id", newsId).maybeSingle(),
            supabase.from("galla_news_bookmarks")
                .select("news_id").eq("user_id", userId).eq("news_id", newsId).maybeSingle(),
            supabase.from("galla_news_reactions")
                .select("value").eq("user_id", userId).eq("news_id", newsId).maybeSingle()
        ]);
        if (!n) { location.href = `search.html?gn=${newsId}`; return; }

        let liked = rx?.value === 1;
        let saved = !!bm;
        openQuickView({
            mediaHtml: qvImg(n.hero_image),
            cat: `${n.category || ""} · 갈라뉴스`,
            title: n.title,
            desc: n.summary || "",
            stats: n.source_count ? `<span>출처 ${n.source_count}곳 종합</span>` : "",
            actions: [
                {
                    label: liked ? "👍 좋아요 취소" : "👍 좋아요",
                    active: liked,
                    onClick: async (btn) => {
                        if (liked) {
                            await supabase.from("galla_news_reactions").delete()
                                .eq("user_id", userId).eq("news_id", newsId);
                        } else {
                            await supabase.from("galla_news_reactions")
                                .upsert({ news_id: newsId, user_id: userId, value: 1 }, { onConflict: "news_id,user_id" });
                        }
                        liked = !liked;
                        btn.textContent = liked ? "👍 좋아요 취소" : "👍 좋아요";
                        btn.classList.toggle("on", liked);
                    }
                },
                {
                    label: BM_ICON + '<span class="qv-act-txt">' + (saved ? "저장됨" : "저장") + '</span>',
                    active: saved,
                    onClick: async (btn) => {
                        if (saved) {
                            await supabase.from("galla_news_bookmarks").delete()
                                .eq("user_id", userId).eq("news_id", newsId);
                        } else {
                            await supabase.from("galla_news_bookmarks").insert({ news_id: newsId, user_id: userId });
                        }
                        saved = !saved;
                        btn.querySelector(".qv-act-txt").textContent = saved ? "저장됨" : "저장";
                        btn.classList.toggle("on", saved);
                        qvDirty = true;
                    }
                }
            ],
            goLabel: "기사 전체 읽기",
            goHref: `search.html?gn=${n.id}`
        });
    }

    async function quickViewPlaza(postId) {
        const [{ data: p }, { data: bm }] = await Promise.all([
            supabase.from("plaza_posts")
                .select("id,title,body,category,cover_image,thumbnail,up_count,down_count,view_count")
                .eq("id", postId).maybeSingle(),
            supabase.from("plaza_bookmarks")
                .select("post_id").eq("user_id", userId).eq("post_id", postId).maybeSingle()
        ]);
        if (!p) { location.href = `plaza_detail.html?id=${postId}`; return; }
        // 본문 미리보기: 마커 제거 후 앞 120자
        const plain = (p.body || "").replace(/\[(IMAGE|VIDEO|EMBED)\]\S+/g, "").replace(/\s+/g, " ").trim();

        let saved = !!bm;
        openQuickView({
            mediaHtml: qvImg(p.cover_image || p.thumbnail),
            cat: `${p.category || ""} · 갈라 광장`,
            title: p.title,
            desc: plain.slice(0, 120) + (plain.length > 120 ? "…" : ""),
            stats: `<span>추천 ${p.up_count || 0}</span> · <span>비추 ${p.down_count || 0}</span> · <span>조회 ${p.view_count || 0}</span>`,
            actions: [{
                label: BM_ICON + '<span class="qv-act-txt">' + (saved ? "저장됨" : "저장") + '</span>',
                active: saved,
                onClick: async (btn) => {
                    if (saved) {
                        await supabase.from("plaza_bookmarks").delete()
                            .eq("user_id", userId).eq("post_id", postId);
                    } else {
                        await supabase.from("plaza_bookmarks").insert({ post_id: postId, user_id: userId });
                    }
                    saved = !saved;
                    btn.querySelector(".qv-act-txt").textContent = saved ? "저장됨" : "저장";
                    btn.classList.toggle("on", saved);
                    qvDirty = true;
                }
            }],
            goLabel: "광장에서 보기",
            goHref: `plaza_detail.html?id=${p.id}`
        });
    }

    async function quickViewMarket(marketId) {
        const [{ data: m }, { data: bm }] = await Promise.all([
            supabase.from("markets")
                .select("id,question,category,image_url,volume,market_type,resolved,close_at")
                .eq("id", marketId).maybeSingle(),
            supabase.from("market_bookmarks")
                .select("market_id").eq("user_id", userId).eq("market_id", marketId).maybeSingle()
        ]);
        if (!m) { location.href = `predict-market.html?id=${marketId}`; return; }

        // 대표 선택지 확률
        let topLine = "";
        const { data: outs } = await supabase.from("market_outcomes")
            .select("label,pool_yes,pool_no,sort_order").eq("market_id", marketId);
        if (outs && outs.length) {
            const top = outs.map(o => ({
                label: o.label,
                p: Math.round(o.pool_no / (o.pool_yes + o.pool_no) * 100)
            })).sort((a, b) => b.p - a.p)[0];
            if (top) topLine = `<span><b>${top.p}%</b> ${top.label}</span> · `;
        }

        let saved = !!bm;
        openQuickView({
            mediaHtml: m.image_url ? qvImg(m.image_url) : "",
            cat: `${m.category || ""} · 갈라예측${m.market_type === "multi" ? " · 여러 선택지" : ""}`,
            title: m.question,
            desc: "",
            stats: `${topLine}<span>거래량 ${Math.round(m.volume || 0).toLocaleString("ko-KR")}P</span>${m.resolved ? " · <span>정산 완료</span>" : ""}`,
            actions: [{
                label: BM_ICON + '<span class="qv-act-txt">' + (saved ? "저장됨" : "저장") + '</span>',
                active: saved,
                onClick: async (btn) => {
                    if (saved) {
                        await supabase.from("market_bookmarks").delete()
                            .eq("user_id", userId).eq("market_id", marketId);
                    } else {
                        await supabase.from("market_bookmarks").insert({ market_id: marketId, user_id: userId });
                    }
                    saved = !saved;
                    btn.querySelector(".qv-act-txt").textContent = saved ? "저장됨" : "저장";
                    btn.classList.toggle("on", saved);
                    qvDirty = true;
                }
            }],
            goLabel: "예측하러 가기",
            goHref: `predict-market.html?id=${m.id}`
        });
    }

    // =====================================================
    // 인스타 그리드 카드 (정사각 썸네일 + 하단 타이틀 오버레이)
    // =====================================================
    const igCard = ({ thumb, title, badge, onClick }) => {
        const card = document.createElement("div");
        card.className = "ig-card";
        card.innerHTML = `
            <img src="${thumb || "./assets/logo.png"}" loading="lazy"
                 onerror="this.src='./assets/logo.png'">
            ${badge ? `<span class="ig-badge">${badge}</span>` : ""}
            <div class="ig-title">${title || ""}</div>
        `;
        card.onclick = onClick;
        return card;
    };

    // 텍스트 중심 콘텐츠(예측·뉴스·광장)용 리스트 로우 — 썸네일 좌측 + 제목·메타 우측(가독성↑)
    const mpEsc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const mpRow = ({ thumb, kind, title, meta, onClick }) => {
        const row = document.createElement("div");
        row.className = "mp-row";
        const th = thumb
            ? `<img src="${mpEsc(thumb)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.mp-row-th').classList.add('noimg')">`
            : "";
        row.innerHTML = `
            <span class="mp-row-th${thumb ? "" : " noimg"}" data-kind="${mpEsc(kind || "")}">${th}</span>
            <span class="mp-row-main">
                <span class="mp-row-title">${mpEsc(title || "(제목 없음)")}</span>
                ${meta ? `<span class="mp-row-meta">${meta}</span>` : ""}
            </span>
            <span class="mp-row-go">›</span>`;
        row.onclick = onClick;
        return row;
    };
    const mpAgo = (iso) => {
        if (!iso) return "";
        const s = (Date.now() - new Date(iso).getTime()) / 1000;
        if (s < 3600) return Math.max(1, Math.floor(s / 60)) + "분 전";
        if (s < 86400) return Math.floor(s / 3600) + "시간 전";
        if (s < 2592000) return Math.floor(s / 86400) + "일 전";
        return new Date(iso).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" });
    };

    const emptyMsg = (msg) => `
        <div class="tab-empty" style="color:#777;font-size:14px;padding:24px 16px;">${msg}</div>`;

    // =====================================================
    // Save 갈라 — 내가 북마크한 이슈 (인스타 그리드)
    // =====================================================
    const renderSave = async () => {
        tabContent.className = "content-area";
        if (!isMyPage) {
            tabContent.innerHTML = emptyMsg("저장한 갈라는 본인만 볼 수 있습니다.");
            return;
        }

        tabContent.innerHTML = `<div style="color:#777">불러오는 중...</div>`;

        // Save 갈라 = 저장한 이슈 (예측은 My 예측, 광장은 My 광장에서)
        const { data: ibm } = await supabase
            .from("bookmarks")
            .select("issue_id, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });

        if (!ibm || !ibm.length) {
            tabContent.innerHTML = emptyMsg("저장한 갈라가 없습니다.<br>피드에서 북마크를 눌러 저장해보세요.");
            return;
        }

        const issueIds = ibm.map(b => b.issue_id);
        const { data: issues } = await supabase
            .from("issues")
            .select("id, title, thumbnail_url, video_url, images")
            .in("id", issueIds);

        const iMap = {};
        (issues || []).forEach(i => iMap[i.id] = i);

        tabContent.className = "content-area grid";
        tabContent.innerHTML = "";

        const liveIds = issueIds.filter(id => iMap[id]);
        const qvItems = liveIds.map(id => ({ type: "issue", id }));

        liveIds.forEach((id, myIdx) => {
            const i = iMap[id];
            tabContent.appendChild(igCard({
                thumb: i.thumbnail_url || (Array.isArray(i.images) && i.images[0]) || null,
                title: i.title,
                badge: i.video_url ? "▶" : "",
                onClick: () => openQvList(qvItems, myIdx)
            }));
        });
    };

    // =====================================================
    // 갈라 탭 — My 갈라 / Saved 갈라 서브탭 (mpSubBar 사용)
    // =====================================================
    let gallaSubTab = "mine"; // mine | saved
    const clearSubBar = () => { const s = document.getElementById("mpSubBar"); if (s) s.innerHTML = ""; };
    const renderGalla = () => {
        const subBar = document.getElementById("mpSubBar");
        if (subBar) {
            if (isMyPage) {
                subBar.innerHTML = `
                    <div class="mp-subtabs">
                        <button class="mp-subtab ${gallaSubTab === "mine" ? "active" : ""}" data-sub="mine">My 갈라</button>
                        <button class="mp-subtab ${gallaSubTab === "saved" ? "active" : ""}" data-sub="saved">Saved 갈라</button>
                    </div>`;
                subBar.querySelector(".mp-subtabs").onclick = e => {
                    const b = e.target.closest(".mp-subtab");
                    if (!b || b.dataset.sub === gallaSubTab) return;
                    gallaSubTab = b.dataset.sub;
                    renderGalla();
                };
            } else {
                subBar.innerHTML = ""; // 방문자는 공개 이슈(My)만
            }
        }
        if (gallaSubTab === "saved" && isMyPage) renderSave();
        else renderMy();
    };

    // =====================================================
    // My 예측 — 내가 만든 예측 / 저장한 예측 (서브탭 + 그리드)
    // =====================================================
    let predictSubTab = "mine"; // mine | saved

    const renderPredict = async () => {
        tabContent.className = "content-area";
        tabContent.innerHTML = `<div style="color:#777">불러오는 중...</div>`;

        const showSaved = isMyPage;
        if (!showSaved) predictSubTab = "mine";

        let markets = [];
        if (predictSubTab === "mine") {
            const { data, error } = await supabase
                .from("markets")
                .select("id, question, image_url, created_at")
                .eq("created_by", viewUserId)
                .order("created_at", { ascending: false });
            if (error) {
                console.error("[My Predict] error", error);
                tabContent.innerHTML = emptyMsg("불러오기 실패");
                return;
            }
            markets = data || [];
        } else {
            const { data: bms, error } = await supabase
                .from("market_bookmarks")
                .select("market_id, created_at")
                .eq("user_id", userId)
                .order("created_at", { ascending: false });
            if (error) {
                console.error("[Saved Predict] error", error);
                tabContent.innerHTML = emptyMsg("불러오기 실패");
                return;
            }
            const ids = (bms || []).map(b => b.market_id);
            if (ids.length) {
                const { data: rows } = await supabase
                    .from("markets")
                    .select("id, question, image_url, created_at")
                    .in("id", ids);
                const map = {};
                (rows || []).forEach(m => map[m.id] = m);
                markets = ids.map(id => map[id]).filter(Boolean); // 저장순 유지
            }
        }

        tabContent.className = "content-area";
        tabContent.innerHTML = "";

        if (showSaved) {
            const bar = document.createElement("div");
            bar.className = "mp-subtabs";
            bar.innerHTML = `
                <button class="mp-subtab ${predictSubTab === "mine" ? "active" : ""}" data-sub="mine">내가 만든 예측</button>
                <button class="mp-subtab ${predictSubTab === "saved" ? "active" : ""}" data-sub="saved">저장한 예측</button>`;
            bar.onclick = e => {
                const b = e.target.closest(".mp-subtab");
                if (!b || b.dataset.sub === predictSubTab) return;
                predictSubTab = b.dataset.sub;
                renderPredict();
            };
            tabContent.appendChild(bar);
        }

        if (!markets.length) {
            const empty = document.createElement("div");
            empty.innerHTML = emptyMsg(predictSubTab === "mine"
                ? "아직 만든 예측이 없습니다."
                : "저장한 예측이 없습니다.<br>예측 상세에서 저장을 눌러보세요.");
            tabContent.appendChild(empty);
            return;
        }

        const list = document.createElement("div");
        list.className = "mp-list";
        tabContent.appendChild(list);

        const qvItems = markets.map(m => ({ type: "market", id: m.id }));
        markets.forEach((m, myIdx) => {
            list.appendChild(mpRow({
                thumb: m.image_url,
                kind: "🔮",
                title: m.question,
                meta: `<span class="mp-row-tag predict">🔮 갈라예측</span> ${mpAgo(m.created_at)}`,
                onClick: () => openQvList(qvItems, myIdx)
            }));
        });
    };

    // =====================================================
    // 저장한 뉴스 — 갈라뉴스 북마크 (인스타 그리드)
    // =====================================================
    const renderNews = async () => {
        tabContent.className = "content-area";
        if (!isMyPage) {
            tabContent.innerHTML = emptyMsg("저장한 뉴스는 본인만 볼 수 있습니다.");
            return;
        }

        tabContent.innerHTML = `<div style="color:#777">불러오는 중...</div>`;

        const { data: bms, error: bmErr } = await supabase
            .from("galla_news_bookmarks")
            .select("news_id, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });

        if (bmErr) {
            console.error("[Saved News] error", bmErr);
            tabContent.innerHTML = emptyMsg("불러오기 실패");
            return;
        }

        if (!bms || bms.length === 0) {
            tabContent.innerHTML = emptyMsg("저장한 뉴스가 없습니다.<br>갈라뉴스에서 저장을 눌러보세요.");
            return;
        }

        const newsIds = bms.map(b => b.news_id);
        const { data: newsRows } = await supabase
            .from("galla_news")
            .select("id, title, hero_image, category, published_at")
            .in("id", newsIds);

        const newsMap = {};
        (newsRows || []).forEach(n => newsMap[n.id] = n);

        tabContent.className = "content-area";
        tabContent.innerHTML = "";
        const list = document.createElement("div");
        list.className = "mp-list";
        tabContent.appendChild(list);

        const qvItems = newsIds.filter(id => newsMap[id]).map(id => ({ type: "news", id }));
        let idx = 0;
        newsIds.forEach(id => {
            const n = newsMap[id];
            if (!n) return;
            const myIdx = idx++;
            list.appendChild(mpRow({
                thumb: n.hero_image,
                kind: "📰",
                title: n.title,
                meta: `<span class="mp-row-tag news">📰 갈라뉴스</span> ${n.category ? mpEsc(n.category) + " · " : ""}${mpAgo(n.published_at)}`,
                onClick: () => openQvList(qvItems, myIdx)
            }));
        });
    };

    // =====================================================
    // My 광장 — 내가 쓴 글 / 저장한 글 (서브탭 + 인스타 그리드)
    // =====================================================
    let plazaSubTab = "mine"; // mine | saved

    const renderPlaza = async () => {
        tabContent.className = "content-area";
        tabContent.innerHTML = `<div style="color:#777">불러오는 중...</div>`;

        // 저장한 글은 본인 페이지에서만 (RLS도 본인만 조회 가능)
        const showSaved = isMyPage;
        if (!showSaved) plazaSubTab = "mine";

        let posts = [];
        if (plazaSubTab === "mine") {
            const { data, error } = await supabase
                .from("plaza_posts")
                .select("id, title, thumbnail, cover_image, created_at")
                .eq("user_id", viewUserId)
                .order("created_at", { ascending: false });
            if (error) {
                console.error("[My Plaza] error", error);
                tabContent.innerHTML = emptyMsg("불러오기 실패");
                return;
            }
            posts = data || [];
        } else {
            const { data: bms, error } = await supabase
                .from("plaza_bookmarks")
                .select("post_id, created_at")
                .eq("user_id", userId)
                .order("created_at", { ascending: false });
            if (error) {
                console.error("[Saved Plaza] error", error);
                tabContent.innerHTML = emptyMsg("불러오기 실패");
                return;
            }
            const ids = (bms || []).map(b => b.post_id);
            if (ids.length) {
                const { data: rows } = await supabase
                    .from("plaza_posts")
                    .select("id, title, thumbnail, cover_image, created_at")
                    .in("id", ids);
                const map = {};
                (rows || []).forEach(p => map[p.id] = p);
                posts = ids.map(id => map[id]).filter(Boolean); // 저장순 유지
            }
        }

        // 서브탭 바 + 그리드 컨테이너
        tabContent.className = "content-area";
        tabContent.innerHTML = "";

        if (showSaved) {
            const bar = document.createElement("div");
            bar.className = "mp-subtabs";
            bar.innerHTML = `
                <button class="mp-subtab ${plazaSubTab === "mine" ? "active" : ""}" data-sub="mine">내가 쓴 글</button>
                <button class="mp-subtab ${plazaSubTab === "saved" ? "active" : ""}" data-sub="saved">저장한 글</button>`;
            bar.onclick = e => {
                const b = e.target.closest(".mp-subtab");
                if (!b || b.dataset.sub === plazaSubTab) return;
                plazaSubTab = b.dataset.sub;
                renderPlaza();
            };
            tabContent.appendChild(bar);
        }

        if (!posts.length) {
            const empty = document.createElement("div");
            empty.innerHTML = emptyMsg(plazaSubTab === "mine"
                ? "아직 갈라 광장에 쓴 글이 없습니다."
                : "저장한 광장 글이 없습니다.<br>광장에서 북마크를 눌러 저장해보세요.");
            tabContent.appendChild(empty);
            return;
        }

        const list = document.createElement("div");
        list.className = "mp-list";
        tabContent.appendChild(list);

        const qvItems = posts.map(p => ({ type: "plaza", id: p.id }));
        posts.forEach((p, myIdx) => {
            list.appendChild(mpRow({
                thumb: p.cover_image || p.thumbnail,
                kind: "🏛",
                title: p.title,
                meta: `<span class="mp-row-tag plaza">🏛 광장</span> ${mpAgo(p.created_at)}`,
                onClick: () => openQvList(qvItems, myIdx)
            }));
        });
    };

    // =====================================================
    // 즐겨찾기 — 나를 팔로우하는 사용자
    // =====================================================
    const renderFollower = async () => {
        tabContent.className = "content-area";
        tabContent.innerHTML = `<div style="color:#777">불러오는 중...</div>`;

        const { data: follows, error: followError } = await supabase
            .from("follows")
            .select("follower")
            .eq("following", viewUserId)
            .order("created_at", { ascending: false });

        if (followError) {
            console.error("[Follower] follows error", followError);
            tabContent.innerHTML = emptyMsg("불러오기 실패");
            return;
        }

        if (!follows || follows.length === 0) {
            tabContent.innerHTML = emptyMsg("아직 팔로워가 없습니다.");
            return;
        }

        const followerIds = follows.map(f => f.follower);
        const { data: followUsers, error: usersError } = await supabase
            .from("users")
            .select("id, nickname, level, avatar_url")
            .in("id", followerIds);

        if (usersError) {
            console.error("[Follower] users error", usersError);
            tabContent.innerHTML = emptyMsg("불러오기 실패");
            return;
        }

        const userMap = {};
        (followUsers || []).forEach(u => userMap[u.id] = u);

        tabContent.innerHTML = "";

        followerIds.forEach(fid => {
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

    // =====================================================
    // 탭 카운트 뱃지 (Save/뉴스/팔로워)
    // =====================================================
    async function loadTabCounts() {
        const setCount = (tabName, n) => {
            const el = document.querySelector(`.tab[data-tab="${tabName}"]`);
            if (el && typeof n === "number") {
                el.innerHTML = el.innerHTML.replace(/ <span class="tab-count">.*<\/span>/, "")
                    + ` <span class="tab-count">${n}</span>`;
            }
        };
        let savedPlaza = 0, savedMarkets = 0;
        if (isMyPage) {
            const [{ count: bm }, { count: nbm }, { count: mbm }, { count: pbm }] = await Promise.all([
                supabase.from("bookmarks").select("issue_id", { count: "exact", head: true }).eq("user_id", userId),
                supabase.from("galla_news_bookmarks").select("news_id", { count: "exact", head: true }).eq("user_id", userId),
                supabase.from("market_bookmarks").select("market_id", { count: "exact", head: true }).eq("user_id", userId),
                supabase.from("plaza_bookmarks").select("post_id", { count: "exact", head: true }).eq("user_id", userId)
            ]);
            setCount("save", bm ?? 0); // 이슈만 (예측/광장은 각자 탭)
            setCount("news", nbm ?? 0);
            savedMarkets = mbm ?? 0;
            savedPlaza = pbm ?? 0;
        }
        const [{ count: pz }, { count: mk }] = await Promise.all([
            supabase.from("plaza_posts").select("id", { count: "exact", head: true }).eq("user_id", viewUserId),
            supabase.from("markets").select("id", { count: "exact", head: true }).eq("created_by", viewUserId)
        ]);
        setCount("plaza", (pz ?? 0) + savedPlaza);
        setCount("predict", (mk ?? 0) + savedMarkets);
        const { count: fl } = await supabase
            .from("follows").select("id", { count: "exact", head: true }).eq("following", viewUserId);
        setCount("follower", fl ?? 0);
    }
    loadTabCounts();

    // ---------------------------
    // 탭 클릭 이벤트
    // ---------------------------
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");

            const menu = tab.dataset.tab;

            switch (menu) {
                case "galla": renderGalla(); break;              // 갈라(My/Saved 서브탭)
                case "predict": clearSubBar(); renderPredict(); break;
                case "news": clearSubBar(); renderNews(); break;
                case "plaza": clearSubBar(); renderPlaza(); break;
            }
        });
    });

    // ---------------------------
    // 기본 탭: 갈라 (본인=My/Saved, 방문자=공개 My)
    // ---------------------------
    renderGalla();
});