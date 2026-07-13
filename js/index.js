/********************************************
 *  INDEX.JS — GALLA v2 (세로형 + 커스텀 진영)
 ********************************************/

let cards = [];
window.cards = cards;
let feed = [];
let viewFeed = [];   // 카테고리 필터 적용된 렌더 대상(전체면 feed와 동일)
let bestList, recommendList, bestMore;

/* ===========================
 * 비디오 자동재생 옵저버
 * =========================== */
/* 피드 영상 소리 — 전역 사운드 선호(media-sound.js) 사용. 인덱스·릴스·이슈 통일 */
function syncMuteBtn(vid) { window.GALLA_syncSoundBtns && window.GALLA_syncSoundBtns(); }
function playWithSound(vid) {
    const wantSound = window.GALLA_soundOn && window.GALLA_soundOn() && window.GALLA_gestured;
    vid.muted = !wantSound;
    vid.play().catch(() => { vid.muted = true; vid.play().catch(() => {}); });
    if (window.GALLA_syncSoundBtns) window.GALLA_syncSoundBtns();
}

// 화면 밖 영상은 src를 안 박아 iOS가 메타데이터를 미리 받지 않도록(느림 방지).
// 뷰포트 근처에 오면 그때 src 주입 → 버퍼링 시작.
function ensureVideoSrc(vid) {
    if (!vid.getAttribute('src') && vid.dataset.src) {
        vid.setAttribute('src', vid.dataset.src);
        vid.preload = 'auto';
        try { vid.load(); } catch (e) {}
    }
}

const videoObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
        const vid = e.target;
        const ovId = vid.dataset.overlayId;
        const ov = ovId ? document.getElementById(ovId) : null;
        if (e.isIntersecting && e.intersectionRatio > 0.5) {
            ensureVideoSrc(vid);
            playWithSound(vid);
            if (ov) ov.classList.add('hidden');
        } else {
            vid.pause();
            if (ov) ov.classList.remove('hidden');
        }
    });
}, { threshold: 0.5 });

// 살짝 앞선 프리로더 — 곧 볼 영상만 미리 버퍼(스크롤해도 끊김 없이 즉시 재생)
const videoPreloader = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) ensureVideoSrc(e.target); });
}, { rootMargin: '400px 0px' });

// 개별 음소거 토글 → 전역 선호를 뒤집어 전 영상·페이지에 통일 반영
window.toggleFeedMute = function (vidId, btnId) {
    window.GALLA_setSound(!window.GALLA_soundOn());
};
// 다른 곳(릴스·이슈)에서 선호가 바뀌면 버튼 아이콘 동기화
document.addEventListener('galla:sound', () => window.GALLA_syncSoundBtns && window.GALLA_syncSoundBtns());

/* ===========================
 * 캐러셀 상태
 * =========================== */
const carouselState = {};

function carouselGo(issueId, dir) {
    const state = carouselState[issueId];
    if (!state) return;
    // clamp(끝에서 루프 안 함) — 인스타 동일
    state.idx = Math.max(0, Math.min(state.total - 1, state.idx + dir));
    const i = state.idx;
    const slides = document.getElementById(`slides-${issueId}`);
    const dots = document.getElementById(`dots-${issueId}`);
    const cnt = document.getElementById(`cnt-${issueId}`);
    if (slides) {
        // px 기반 스냅(%의 폭 계산 오차로 두 장 걸쳐 보이던 문제 방지)
        const W = slides.parentElement.offsetWidth;
        slides.style.transition = 'transform .28s ease';
        slides.style.transform = `translateX(${-i * W}px)`;
    }
    if (cnt) cnt.textContent = `${i + 1} / ${state.total}`;
    if (dots) {
        dots.querySelectorAll('.carousel-dot').forEach((d, idx) => {
            d.classList.toggle('on', idx === i);
            d.style.width = idx === i ? '14px' : '5px';
        });
    }
}

/* 슬라이드 폭을 측정한 px로 못박음 — 모바일 사파리/크롬에서 flex-basis:100% 순환 참조로
   슬라이드가 이미지 원본/3배 폭이 돼 한 장이 여러 칸에 걸쳐 보이던 문제 원천 차단 */
function sizeAllCarousels() {
    document.querySelectorAll('.carousel-wrap').forEach(wrap => {
        const slides = wrap.querySelector('.carousel-slides');
        if (!slides) return;
        const w = wrap.clientWidth;
        if (!w) return;
        slides.querySelectorAll('.carousel-slide').forEach(s => {
            s.style.flex = `0 0 ${w}px`;
            s.style.width = `${w}px`;
            s.style.maxWidth = `${w}px`;
        });
        const card = wrap.closest('.card');
        const st = carouselState[Number(card?.dataset.id)];
        if (st) {
            slides.style.transition = 'none';
            slides.style.transform = `translateX(${-st.idx * w}px)`;
        }
    });
}
let __carouselResizeBound = false;

/* ===========================
 * 미디어 렌더러
 * =========================== */
function renderMedia(data) {
    // 영상
    if (data.video_url) {
        return `
        <div class="card-media card-media--video"
             onclick="event.stopPropagation();openReels(${data.id})">
            <video
                id="vid-${data.id}"
                data-src="${data.video_url}"
                ${data.thumbnail_url ? `poster="${data.thumbnail_url}"` : ""}
                loop playsinline webkit-playsinline muted preload="none">
            </video>
            <div class="vid-dur" id="dur-${data.id}">-:--</div>
            <button class="vid-mute" id="mute-${data.id}"
                    onclick="event.stopPropagation();toggleFeedMute('vid-${data.id}','mute-${data.id}')">🔇</button>
            <span class="vid-reels-badge">▶︎ 릴스로 보기</span>
        </div>`;
    }

    // 사진 캐러셀
    if (data.images && data.images.length > 0) {
        const imgs = data.images;
        const total = imgs.length;
        carouselState[data.id] = { idx: 0, total };
        const dotsHtml = imgs.map((_, i) =>
            `<div class="carousel-dot ${i === 0 ? 'on' : ''}"></div>`).join('');
        // 캐러셀은 lazy 금지 — 가로 오프스크린이라 안 불러와져 넘기면 빈 슬라이드가 됨
        // 4:5 세로 프레임에 꽉 채움(cover). 가로 사진은 업로드 때 크롭 영역을 선택하므로 이미 세로임.
        const slidesHtml = imgs.map(url =>
            `<div class="carousel-slide"><img src="${url}" loading="eager" decoding="async"></div>`).join('');
        return `
        <div class="card-media" onclick="event.stopPropagation()">
            <div class="carousel-wrap">
                <div class="carousel-slides" id="slides-${data.id}">${slidesHtml}</div>
                ${total > 1 ? `
                <button class="carousel-arr l" onclick="carouselGo(${data.id},-1)">‹</button>
                <button class="carousel-arr r" onclick="carouselGo(${data.id},1)">›</button>
                <div class="carousel-cnt" id="cnt-${data.id}">1 / ${total}</div>
                <div class="carousel-dots" id="dots-${data.id}">${dotsHtml}</div>
                ` : ''}
            </div>
        </div>`;
    }

    // 썸네일 단일 이미지
    if (data.thumb) {
        return `
        <div class="card-media">
            <img src="${data.thumb}" loading="lazy" alt="">
        </div>`;
    }

    // 없음
    return `
    <div class="card-media">
        <span class="card-media-empty">이미지 없음</span>
    </div>`;
}

/* ===========================
 * 카드 렌더러
 * =========================== */
const moreIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`;

function renderCard(data) {
    const total = (data.pro + data.con) || 1;
    const proPct = Math.round((data.pro / total) * 100);
    const conPct = 100 - proPct;

    const factionA = data.faction_a || '👍 찬성이오';
    const factionB = data.faction_b || '👎 난 반댈세';

    const w = data.war || {
        pro: { total: 0, same: 0, oppo: 0 },
        con: { total: 0, same: 0, oppo: 0 },
        atk: 0, def: 0, sup: 0
    };

    const avatarImg = window.GALLA_avatarImg
      ? window.GALLA_avatarImg(data.avatar_url, 'mah-avatar-img')
      : `<div class="mah-avatar">${(data.author || '익').trim().charAt(0) || '익'}</div>`;

    return `
    <div class="card${data.pinned ? ' pinned' : ''}" data-id="${data.id}" data-link="issue.html?id=${data.id}">
        <div class="media-author-head">
            <div class="mah-left">
                <div class="mah-avatar"${data.user_id ? ` data-profile-uid="${data.user_id}"` : ''}>${avatarImg}</div>
                <div class="mah-info">
                    <div class="mah-line1">
                        <span class="author-name"${data.user_id ? ` data-profile-uid="${data.user_id}"` : ''}>${data.author}</span>
                        <span class="level-badge">Lv.${data.level}</span>
                    </div>
                    <div class="mah-line2">${data.pinned ? '<span class="pin-chip">📌 부스트</span> ' : ''}${data.category} · ${data.time}</div>
                </div>
            </div>
            ${data.user_id ? `<button class="follow-btn" data-uid="${data.user_id}">+ 팔로우</button>` : ''}
        </div>

        ${renderMedia(data)}

        <div class="card-body">
            <div class="card-title">${data.title}</div>
            ${data.oneLine ? `<div class="card-desc">${data.oneLine}</div>` : ''}

            <div class="faction-btns">
                <button class="faction-btn faction-btn-a vote-btn" data-type="pro">👍 ${factionA}</button>
                <button class="faction-btn faction-btn-b vote-btn" data-type="con">👎 ${factionB}</button>
            </div>

            <div class="vote-bar">
                <div class="vote-pro" style="width:${proPct}%"></div>
                <div class="vote-con" style="width:${conPct}%"></div>
            </div>
            <div class="vote-stats">
                <span>${proPct}% · ${data.pro}명</span>
                <span>${conPct}% · ${data.con}명</span>
            </div>

            <div class="war-dashboard goto-comments">
                <div class="war-title">⚔ 전황표</div>
                <div class="war-grid">
                    <div class="war-box pro">
                        <div class="war-label">👍 진영</div>
                        <div class="war-stat">총 댓글 <b>${w.pro.total}</b></div>
                        <div class="war-sub">동진영 ${w.pro.same} · 적진 ${w.pro.oppo}</div>
                    </div>
                    <div class="war-box neutral">
                        <div class="war-label">전체 전장</div>
                        <div class="war-stat">총 교전 <b>${w.atk + w.def + w.sup}</b></div>
                        <div class="war-sub">공격 ${w.atk} · 지원 ${w.sup} · 방어 ${w.def}</div>
                    </div>
                    <div class="war-box con">
                        <div class="war-label">👎 진영</div>
                        <div class="war-stat">총 댓글 <b>${w.con.total}</b></div>
                        <div class="war-sub">동진영 ${w.con.same} · 적진 ${w.con.oppo}</div>
                    </div>
                </div>
            </div>

            <div class="card-footer">
                <div class="footer-icons">
                    <img src="assets/icons/icon-comment.svg" class="goto-comments">
                    <img src="assets/icons/icon-bookmark.svg" class="bookmark-btn" data-id="${data.id}">
                    <img src="assets/icons/icon-share.svg" class="share-btn" data-id="${data.id}">
                </div>
                <button class="more-btn card-more" data-id="${data.id}" data-uid="${data.user_id || ''}" aria-label="더보기">${moreIcon}</button>
            </div>
        </div>

    </div>`;
}

/* ===========================
 * 비디오 컨트롤
 * =========================== */
function toggleVidPlay(vidId, ovId) {
    const v = document.getElementById(vidId);
    const o = document.getElementById(ovId);
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); o?.classList.add('hidden'); }
    else { v.pause(); o?.classList.remove('hidden'); }
}

function toggleMute(vidId, btnId) {
    const v = document.getElementById(vidId);
    if (!v) return;
    v.muted = !v.muted;
    const btn = document.getElementById(btnId);
    if (btn) btn.textContent = v.muted ? '🔇' : '🔊';
}

/* 인라인 영상 탭 → 전체화면 릴스 모드 */
window.openReels = function (startId) {
    const vids = (window.cards || [])
        .filter(c => c.video_url)
        .map(c => ({
            id: c.id, video_url: c.video_url, title: c.title,
            author: c.author, level: c.level, category: c.category,
            avatar_url: c.avatar_url,
            user_id: c.user_id, faction_a: c.faction_a, faction_b: c.faction_b
        }));
    if (!vids.length) return;
    // 이어보기: 인라인 미리보기의 현재 재생 위치를 릴스로 넘김
    const inlineVid = document.getElementById('vid-' + startId);
    const startTime = inlineVid && !isNaN(inlineVid.currentTime) ? inlineVid.currentTime : 0;
    // 인라인 미리보기 정지 (소리 중복 방지)
    document.querySelectorAll('.card-media video').forEach(v => v.pause());
    if (typeof window.openShorts === 'function') {
        window.openShorts(vids, Number(startId), startTime);
    } else {
        location.href = `issue.html?id=${startId}`;
    }
};

/* ===========================
 * 투표 UI
 * =========================== */
async function applyVoteUI(cardEl, stance) {
    const btnA = cardEl.querySelector('.faction-btn-a');
    const btnB = cardEl.querySelector('.faction-btn-b');
    if (!btnA || !btnB) return;
    if (stance === 'pro') btnA.classList.add('voted');
    else if (stance === 'con') btnB.classList.add('voted');
    btnA.classList.add('disabled');
    btnB.classList.add('disabled');
}

async function waitForSessionReady(timeout = 2500) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (window.supabaseClient) {
            const { data } = await window.supabaseClient.auth.getSession();
            if (data?.session) return true;
        }
        await new Promise(r => setTimeout(r, 100));
    }
    return false;
}

async function syncVoteWithRetry(cardEl, id, retry = 0) {
    if (retry === 0) {
        const ready = await waitForSessionReady();
        if (!ready) return;
    }
    if (typeof window.GALLA_CHECK_VOTE !== 'function') return;
    const stance = await window.GALLA_CHECK_VOTE(id);
    if (stance === null || stance === '__SESSION_PENDING__') {
        setTimeout(() => syncVoteWithRetry(cardEl, id, retry + 1), 300);
        return;
    }
    if (stance === 'pro' || stance === 'con') {
        await applyVoteUI(cardEl, stance);
    }
}

/* ===========================
 * 소셜 상태 (팔로우 / 북마크)
 * =========================== */
const social = {
    userId: null,
    follows: new Set(),     // 내가 팔로우한 user_id
    bookmarks: new Set(),   // 내가 북마크한 issue_id (문자열)
    loaded: false
};

async function initSocial() {
    const supabase = window.supabaseClient;
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (user) {
        social.userId = user.id;
        const [f, b] = await Promise.all([
            supabase.from('follows').select('following').eq('follower', user.id),
            supabase.from('bookmarks').select('issue_id').eq('user_id', user.id)
        ]);
        f.data?.forEach(r => social.follows.add(r.following));
        b.data?.forEach(r => social.bookmarks.add(String(r.issue_id)));
    }
    social.loaded = true;
    applySocialState();
}

function setFollowUI(btn, on) {
    btn.classList.toggle('following', on);
    btn.textContent = on ? '팔로잉' : '+ 팔로우';
}

function applySocialState() {
    if (!social.loaded) return;
    document.querySelectorAll('.follow-btn[data-uid]').forEach(btn => {
        if (social.userId && btn.dataset.uid === social.userId) {
            btn.style.display = 'none';
            return;
        }
        setFollowUI(btn, social.follows.has(btn.dataset.uid));
    });
    document.querySelectorAll('.bookmark-btn').forEach(img => {
        img.classList.toggle('active', social.bookmarks.has(img.dataset.id));
    });
}

async function toggleFollow(btn) {
    if (!social.userId) return window.GALLA_needLogin ? window.GALLA_needLogin('로그인이 필요해요.') : openModal('로그인이 필요합니다.');
    const supabase = window.supabaseClient;
    const uid = btn.dataset.uid;
    const on = social.follows.has(uid);

    // 낙관적 갱신 (같은 작성자의 모든 카드에 반영)
    if (on) social.follows.delete(uid); else social.follows.add(uid);
    applySocialState();

    const { error } = on
        ? await supabase.from('follows').delete()
            .eq('follower', social.userId).eq('following', uid)
        : await supabase.from('follows').insert({ follower: social.userId, following: uid });

    if (error && error.code !== '23505') {
        if (on) social.follows.add(uid); else social.follows.delete(uid);
        applySocialState();
        openModal('처리에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
}

async function toggleBookmark(img) {
    if (!social.userId) return window.GALLA_needLogin ? window.GALLA_needLogin('로그인이 필요해요.') : openModal('로그인이 필요합니다.');
    const supabase = window.supabaseClient;
    const id = img.dataset.id;
    const on = social.bookmarks.has(id);

    if (on) social.bookmarks.delete(id); else social.bookmarks.add(id);
    applySocialState();

    const { error } = on
        ? await supabase.from('bookmarks').delete()
            .eq('user_id', social.userId).eq('issue_id', Number(id))
        : await supabase.from('bookmarks').insert({ user_id: social.userId, issue_id: Number(id) });

    if (error && error.code !== '23505') {
        if (on) social.bookmarks.add(id); else social.bookmarks.delete(id);
        applySocialState();
        openModal('처리에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
}

function shareIssue(id) {
    const card = window.cards.find(c => String(c.id) === String(id));
    const url = window.GALLA_shareUrl ? window.GALLA_shareUrl('issue', id) : new URL(`issue.html?id=${id}`, location.href).href;
    const title = card?.title ? `⚔️ ${card.title}` : 'GALLA';
    if (window.GALLA_share) return window.GALLA_share({ url, title, text: '찬성이냐 반대냐, 당신의 진영은?' });
    if (navigator.share) { navigator.share({ title, url }).catch(() => {}); return; }
    navigator.clipboard?.writeText(url).then(() => openModal('링크가 복사되었습니다.'));
}

/* ===========================
 * 이벤트 바인딩
 * =========================== */
function attachEvents() {
    // 투표 버튼
    document.querySelectorAll('.vote-btn').forEach(btn => {
        btn.onclick = async e => {
            e.stopPropagation();
            if (document.body.classList.contains('shorts-open')) return;
            const type = btn.dataset.type;
            const card = btn.closest('.card');
            const id = Number(card.dataset.id);
            if (typeof window.GALLA_VOTE !== 'function') return;
            await window.GALLA_VOTE(id, type);
        };
    });

    // 모달
    document.querySelectorAll('.open-modal').forEach(el => {
        el.onclick = e => {
            e.stopPropagation();
            openModal(el.dataset.msg);
        };
    });

    // 팔로우
    document.querySelectorAll('.follow-btn[data-uid]').forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();
            toggleFollow(btn);
        };
    });

    // 북마크
    document.querySelectorAll('.bookmark-btn').forEach(img => {
        img.onclick = e => {
            e.stopPropagation();
            toggleBookmark(img);
        };
    });

    // 공유
    document.querySelectorAll('.share-btn').forEach(img => {
        img.onclick = e => {
            e.stopPropagation();
            shareIssue(img.dataset.id);
        };
    });

    // ⋯ 더보기: 소유자·관리자 → 수정/삭제, 아니면 → 신고/차단
    document.querySelectorAll('.card-more').forEach(btn => {
        btn.onclick = async e => {
            e.stopPropagation();
            const id = btn.dataset.id, uid = btn.dataset.uid || null;
            const card = window.cards?.find(c => String(c.id) === String(id));
            const canManage = window.GALLA_canManage ? await window.GALLA_canManage(uid) : false;
            if (canManage && window.GALLA_openOwnerMenu) {
                window.GALLA_openOwnerMenu({
                    table: 'issues', id: Number(id), ownerId: uid, label: '갈라',
                    editFields: [
                        { key: 'title', label: '제목', type: 'text', value: card?.title || '' },
                        { key: 'category', label: '카테고리', type: 'select', options: window.GALLA_CATEGORIES, value: card?.category || '' },
                    ],
                    onDeleted: () => { btn.closest('.card')?.remove(); },
                });
            } else if (window.GALLA_openReportMenu) {
                window.GALLA_openReportMenu({
                    contentType: 'issue', contentId: id, authorId: uid, authorName: card?.author,
                    onBlocked: () => { document.querySelectorAll('.card').forEach(c => { if (window.cards?.find(x => String(x.id) === c.dataset.id)?.user_id === uid) c.remove(); }); },
                });
            }
        };
    });

    // 전황표 → 이슈 댓글
    document.querySelectorAll('.goto-comments').forEach(el => {
        el.onclick = e => {
            e.stopPropagation();
            const card = el.closest('.card');
            location.href = `issue.html?id=${card.dataset.id}#battle-zone`;
        };
    });

    // 예측 카드 클릭 → 예측 상세 (위임: innerHTML+= 재렌더로 리스너 유실되는 문제 방지)
    if (!window.__predictClickDelegated) {
        window.__predictClickDelegated = true;
        document.addEventListener('click', e => {
            const c = e.target.closest('.predict-feed-card');
            if (c && c.dataset.mid) {
                location.href = `predict-market.html?id=${c.dataset.mid}`;
            }
        });
    }

    // 카드 전체 클릭
    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', e => {
            const url = card.dataset.link;
            if (url) location.href = url;
        });
    });

    // 캐러셀 터치 스와이프 — 손가락 추적 라이브 드래그(인스타 스타일)
    document.querySelectorAll('.carousel-wrap').forEach(wrap => {
        if (wrap.dataset.swipeBound) return;
        wrap.dataset.swipeBound = '1';
        const slides = wrap.querySelector('.carousel-slides');
        const card = wrap.closest('.card');
        const id = Number(card?.dataset.id);
        const st = carouselState[id];
        if (!slides || !st) return;

        let startX = 0, startY = 0, W = 0, dragging = false, decided = false, horiz = false;

        wrap.addEventListener('touchstart', e => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            W = wrap.offsetWidth;
            dragging = true; decided = false; horiz = false;
            slides.style.transition = 'none';
        }, { passive: true });

        wrap.addEventListener('touchmove', e => {
            if (!dragging) return;
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;
            if (!decided) {
                if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
                decided = true;
                horiz = Math.abs(dx) > Math.abs(dy);
            }
            if (!horiz) return;               // 세로 스크롤은 페이지에 양보
            let d = dx;
            // 양 끝에서는 저항
            if ((st.idx === 0 && dx > 0) || (st.idx === st.total - 1 && dx < 0)) d = dx * 0.35;
            slides.style.transform = `translateX(${-st.idx * W + d}px)`;
        }, { passive: true });

        wrap.addEventListener('touchend', e => {
            if (!dragging) return;
            dragging = false;
            if (!horiz) return;
            const dx = e.changedTouches[0].clientX - startX;
            const THRESH = Math.min(60, W * 0.2);
            if (dx <= -THRESH) carouselGo(id, 1);
            else if (dx >= THRESH) carouselGo(id, -1);
            else carouselGo(id, 0);           // 문턱 미달 → 제자리 스냅
        }, { passive: true });
    });

    // 슬라이드 폭 px 고정 (모바일 flex-basis 순환 참조 방지)
    sizeAllCarousels();
    requestAnimationFrame(sizeAllCarousels);
    if (!__carouselResizeBound) {
        __carouselResizeBound = true;
        window.addEventListener('resize', sizeAllCarousels);
    }

    // 비디오 자동재생 옵저버 등록
    document.querySelectorAll('.card-media video').forEach(v => {
        videoObserver.observe(v);
        videoPreloader.observe(v);
        v.addEventListener('loadedmetadata', () => {
            const t = Math.floor(v.duration);
            const dur = document.getElementById(`dur-${v.id.replace('vid-', '')}`);
            if (dur) dur.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
        });
    });

    // 투표 상태 복원
    if (typeof window.GALLA_CHECK_VOTE === 'function') {
        document.querySelectorAll('.card').forEach(cardEl => {
            syncVoteWithRetry(cardEl, Number(cardEl.dataset.id));
        });
    }

    // 팔로우/북마크 상태 복원 (무한 스크롤로 추가된 카드 포함)
    applySocialState();
}

/* ===========================
 * 데이터 로드
 * =========================== */
document.addEventListener('DOMContentLoaded', async () => {
    bestList = document.getElementById('best-list');
    recommendList = document.getElementById('recommend-list');
    bestMore = document.getElementById('best-more');

    while (!window.supabaseClient) {
        await new Promise(r => setTimeout(r, 30));
    }
    initHeader();
    initSocial();
    if (window.initNotifications) window.initNotifications();
    await loadData();
});

/* 헤더: + 글쓰기(권한 게이팅) / ♥ 알림 */
function initHeader() {
    // + 글쓰기: 통합 허브(갈라/예측/광장 선택). 홈이므로 갈라 우선
    document.getElementById('hdrWrite')?.addEventListener('click',
        () => window.openWriteHub && window.openWriteHub('galla'));
    // ♥ 알림 클릭은 notifications.js가 바인딩
}

// 스크롤 복원/저장
if (localStorage.getItem('scrollPos')) {
    window.scrollTo(0, Number(localStorage.getItem('scrollPos')));
}
window.addEventListener('scroll', () => {
    localStorage.setItem('scrollPos', window.scrollY);
});

async function loadData() {
    const supabase = window.supabaseClient;

    let { data: issues, error } = await supabase
        .from('issues')
        .select(`
            id, title, one_line, category, created_at,
            pro_count, con_count, sup_pro, sup_con,
            user_id, thumbnail_url, video_url, images,
            faction_a, faction_b
        `)
        .order('created_at', { ascending: false });

    if (error) { console.error(error); return; }

    // 차단한 사용자의 갈라는 피드에서 제외
    let issuesF = issues;
    if (window.GALLA_blockedIds) {
        try { const blocked = await window.GALLA_blockedIds(); if (blocked.size) issuesF = issues.filter(i => !blocked.has(i.user_id)); } catch (_) {}
    }
    issues = issuesF;

    const userIds = [...new Set(issues.map(i => i.user_id).filter(Boolean))];
    // users 테이블 = 닉네임(정본)·레벨·아바타 한 번에
    const { data: profiles } = await supabase
        .from('users')
        .select('id, nickname, level, avatar_url')
        .in('id', userIds);

    const profileMap = {};
    profiles?.forEach(p => profileMap[p.id] = p);

    cards = issues.map(row => ({
        id: row.id,
        user_id: row.user_id,
        category: row.category,
        author: profileMap[row.user_id]?.nickname || '익명',
        level: profileMap[row.user_id]?.level || 1,
        avatar_url: profileMap[row.user_id]?.avatar_url || null,
        time: new Date(row.created_at).toLocaleDateString(),
        title: row.title,
        oneLine: row.one_line,
        pro: row.pro_count || 0,
        con: row.con_count || 0,
        thumb: row.thumbnail_url,
        video_url: row.video_url,
        faction_a: row.faction_a,
        faction_b: row.faction_b,
        images: Array.isArray(row.images) && row.images.length > 0
            ? row.images
            : (row.thumbnail_url ? [row.thumbnail_url] : [])
    }));

    const issueIds = cards.map(c => c.id);

    // 🚀 부스트: 24h 상단 고정된 이슈를 맨 앞으로 + 배지
    try {
        const { data: pins } = await supabase.from('content_boosts')
            .select('target_id').eq('kind', 'pin').gt('until', new Date().toISOString());
        const pinSet = new Set((pins || []).map(p => Number(p.target_id)));
        if (pinSet.size) {
            cards.forEach(c => { if (pinSet.has(Number(c.id))) c.pinned = true; });
            cards.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
        }
    } catch (_) {}

    // 내 투표 상태를 한 번에 프리페치(카드별 N+1 쿼리 제거) + 전황 집계를 병렬로
    const [warMap] = await Promise.all([
        loadWarData(issueIds),
        window.GALLA_PREFETCH_VOTES ? window.GALLA_PREFETCH_VOTES(issueIds) : Promise.resolve()
    ]);
    cards = cards.map(c => ({ ...c, war: warMap[c.id] }));
    window.cards = cards;

    // 예측 마켓 + 광장 글을 이슈와 교차 배열 (이슈2 · 예측1 · 광장1 리듬)
    const [predictionCards, plazaCards] = await Promise.all([
        loadPredictionCards(),
        loadPlazaCards()
    ]);
    feed = interleave(cards, predictionCards, plazaCards);
    window.feed = feed;
    viewFeed = feed;

    loadBest();
    loadRecommend();
}

// 인덱스 카테고리 칩 — 검색페이지로 이동하지 않고 '그 자리에서' 피드를 필터
window.GALLA_filterFeed = function (cat, el) {
    document.querySelectorAll('.category-section .chip').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
    viewFeed = (!cat || cat === '전체') ? feed : feed.filter(it => (it.data && it.data.category) === cat);
    rec = 3;
    if (recommendList) recommendList.innerHTML = '';
    loadBest();
    loadRecommend();
    if (bestList && !viewFeed.length) bestList.innerHTML = '<div class="feed-empty" style="padding:40px 16px;text-align:center;color:var(--muted,#8a8f9a);font-size:14px">이 카테고리엔 아직 갈라가 없어요.</div>';
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// 이슈 2개마다 예측 1개, 3개마다 광장 1개를 끼워 배치
function interleave(issues, predicts, plazas = []) {
    const out = [];
    let pi = 0, zi = 0;
    issues.forEach((c, i) => {
        out.push({ type: 'issue', data: c });
        if ((i + 1) % 2 === 0 && predicts[pi]) out.push({ type: 'predict', data: predicts[pi++] });
        if ((i + 1) % 3 === 0 && plazas[zi]) out.push({ type: 'plaza', data: plazas[zi++] });
    });
    while (pi < predicts.length) out.push({ type: 'predict', data: predicts[pi++] });
    while (zi < plazas.length) out.push({ type: 'plaza', data: plazas[zi++] });
    return out;
}

// 광장 글을 피드용으로 로드 (최신순 + 점수/신규 가점 가벼운 정렬)
async function loadPlazaCards() {
    const supabase = window.supabaseClient;
    const { data: posts } = await supabase
        .from('plaza_posts')
        .select('id, category, title, body, nickname, cover_image, thumbnail, up_count, view_count, user_id, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
    if (!posts || !posts.length) return [];
    const now = Date.now();
    return posts.map(p => {
        const ageH = (now - new Date(p.created_at)) / 3600000;
        const fresh = ageH < 24 ? 40 : ageH < 168 ? 15 : 0;
        return { ...p, _score: (p.up_count || 0) * 3 + (p.view_count || 0) * 0.2 + fresh + Math.random() * 8 };
    }).sort((a, b) => b._score - a._score).slice(0, 8);
}

// 광장 본문에서 텍스트만 뽑아 1~2줄 요약
function plazaExcerpt(body) {
    if (!body) return '';
    return String(body)
        .replace(/^\[(IMAGE|VIDEO|EMBED)\].*$/gim, ' ')   // 미디어 마커 제거
        .replace(/[#>*_~`\-]/g, ' ')                        // 마크다운 기호 제거
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')            // 링크 → 텍스트
        .replace(/\s+/g, ' ').trim().slice(0, 80);
}

/* 홈 피드용 광장 카드 (톤 유지, '광장'으로 명확히 구분) */
// 외부 커뮤 썸네일은 핫링크 차단 많아 galla.im 자체 프록시 경유(원본은 그대로)
function plazaProxify(u) {
    if (!u || typeof u !== 'string') return u;
    if (u.startsWith('/') || u.includes('/imgproxy?') || u.includes('supabase.co/storage')) return u;
    if (!/^https?:\/\//i.test(u)) return u;
    return '/imgproxy?u=' + encodeURIComponent(u);
}
function renderPlazaCard(p) {
    const cover = plazaProxify(p.cover_image || p.thumbnail || '');
    const excerpt = plazaExcerpt(p.body);
    const cat = p.category ? escHtml(p.category) : '광장';
    return `
    <div class="card plaza-card" onclick="location.href='plaza_detail.html?id=${p.id}'">
      <div class="pz-head">
        <span class="pz-badge">🏛 광장</span>
        <span class="pz-cat">${cat}</span>
        <span class="pz-author">${escHtml(p.nickname || '익명')}</span>
      </div>
      <div class="pz-body">
        <div class="pz-text">
          <div class="pz-title">${escHtml(p.title || '(제목 없음)')}</div>
          ${excerpt ? `<div class="pz-excerpt">${escHtml(excerpt)}</div>` : ''}
        </div>
        ${cover ? `<div class="pz-thumb"><img src="${escHtml(cover)}" loading="lazy" alt="" style="opacity:0;transition:opacity .18s" onload="this.style.opacity=1" onerror="this.closest('.pz-thumb')?.remove()"></div>` : ''}
      </div>
      <div class="pz-foot">
        <span>👍 ${p.up_count || 0}</span>
        <span>👁 ${p.view_count || 0}</span>
        <span class="pz-go">글 보기 ›</span>
      </div>
    </div>`;
}

async function loadPredictionCards() {
    const supabase = window.supabaseClient;
    let { data: markets } = await supabase
        .from('markets')
        .select('id, question, category, market_type, volume, close_at, resolved, created_at, created_by')
        .eq('resolved', false)
        .limit(60);
    if (!markets || !markets.length) return [];

    // 알고리즘: 반응(거래량) 많은 것 위주 + 신규 가점 + 랜덤(매번 다르게)
    const now = Date.now();
    markets = markets.map(m => {
        const ageH = (now - new Date(m.created_at)) / 3600000;
        const freshBonus = ageH < 24 ? 6000 : ageH < 168 ? 2500 : 0; // 신규(24h)·이번주 가점
        const engagement = (m.volume || 0) + freshBonus;
        const jitter = 0.6 + Math.random() * 0.9;                     // 랜덤 요소
        return { ...m, _score: engagement * jitter + Math.random() * 1500 };
    }).sort((a, b) => b._score - a._score).slice(0, 12);

    const ids = markets.map(m => m.id);
    const { data: outs } = await supabase
        .from('market_outcomes')
        .select('market_id, label, pool_yes, pool_no, sort_order')
        .in('market_id', ids);
    const byM = {};
    outs?.forEach(o => (byM[o.market_id] ||= []).push(o));
    Object.values(byM).forEach(a => a.sort((x, y) => x.sort_order - y.sort_order));

    // 크리에이터(작성자) 프로필 로드
    const creatorIds = [...new Set(markets.map(m => m.created_by).filter(Boolean))];
    const profMap = {};
    if (creatorIds.length) {
        const { data: profs } = await supabase
            .from('user_profiles')
            .select('user_id, nickname, level')
            .in('user_id', creatorIds);
        profs?.forEach(p => (profMap[p.user_id] = p));
    }

    const pct = o => Math.round(o.pool_no / (o.pool_yes + o.pool_no) * 100);
    return markets.map(m => {
        const list = (byM[m.id] || []).map(o => ({ label: o.label, p: pct(o) }));
        const prof = profMap[m.created_by];
        return {
            ...m,
            outcomes: list,
            creatorName: prof?.nickname || '갈라 크리에이터',
            creatorLevel: prof?.level ?? 1
        };
    });
}

/* 홈 피드용 예측 카드 (톤 유지, 명확히 '예측') */
function renderPredictCard(m) {
    const multi = m.market_type === 'multi';
    let body;
    if (multi) {
        const top = m.outcomes.slice().sort((a, b) => b.p - a.p).slice(0, 3);
        body = `<div class="pf-multi">
            ${top.map(o => `<div class="pf-multi-row"><span>${escHtml(o.label)}</span><b>${o.p}%</b></div>`).join('')}
            ${m.outcomes.length > 3 ? `<div class="pf-more">+${m.outcomes.length - 3}개 선택지</div>` : ''}
        </div>`;
    } else {
        const p = m.outcomes[0] ? m.outcomes[0].p : 50;
        body = `<div class="pf-bar"><div class="pf-bar-yes" style="width:${p}%"></div></div>
            <div class="pf-legend"><span class="pf-yes">👍 YES ${p}%</span><span class="pf-no">👎 NO ${100 - p}%</span></div>`;
    }
    const cName = escHtml(m.creatorName || '갈라 크리에이터');
    const cInit = (m.creatorName || '갈').trim().charAt(0) || '갈';
    const cLv = m.creatorLevel ?? 1;
    return `
    <div class="predict-feed-card" data-mid="${m.id}">
        <div class="pf-top">
            <span class="pf-badge">🔮 갈라예측</span>
            <span class="pf-cat">${escHtml(m.category || '')}${multi ? ' · 여러 선택지' : ''}</span>
        </div>
        <div class="pf-creator">
            <div class="pf-avatar">${cInit}</div>
            <div class="pf-cinfo">
                <div class="pf-cline">
                    <span class="pf-cname">${cName}</span>
                    <span class="pf-clv">Lv.${cLv}</span>
                    <span class="pf-ctag">크리에이터</span>
                </div>
                <div class="pf-csub">이 예측을 만든 크리에이터</div>
            </div>
        </div>
        <div class="pf-q">${escHtml(m.question)}</div>
        ${body}
        <div class="pf-foot">
            <span class="pf-vol">💰 거래량 ${(Math.round(m.volume)).toLocaleString('ko-KR')}P</span>
            <span class="pf-go">예측하러 가기 ›</span>
        </div>
    </div>`;
}
function escHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function renderFeedItem(item){
    if (item.type === 'predict') return renderPredictCard(item.data);
    if (item.type === 'plaza') return renderPlazaCard(item.data);
    return renderCard(item.data);
}

async function loadWarData(issueIds) {
    const supabase = window.supabaseClient;
    const { data, error } = await supabase
        .from('comments')
        .select('issue_id, faction, attack_count, defense_count, support_count')
        .in('issue_id', issueIds);

    if (error) return {};

    const warMap = {};
    issueIds.forEach(id => {
        warMap[id] = { pro: { total: 0, same: 0, oppo: 0 }, con: { total: 0, same: 0, oppo: 0 }, atk: 0, def: 0, sup: 0 };
    });

    data.forEach(row => {
        const w = warMap[row.issue_id];
        if (!w) return;
        const f = row.faction;
        if (!w[f]) return;
        w[f].total++;
        w.atk += row.attack_count || 0;
        w.def += row.defense_count || 0;
        w.sup += row.support_count || 0;
        w[f].same += (row.defense_count || 0) + (row.support_count || 0);
        const enemy = f === 'pro' ? 'con' : 'pro';
        w[enemy].oppo += row.attack_count || 0;
    });

    return warMap;
}

function loadBest() {
    bestList.innerHTML = '';
    viewFeed.slice(0, 3).forEach(item => bestList.innerHTML += renderFeedItem(item));
    attachEvents();
}

let rec = 3;
function loadRecommend() {
    for (let i = 0; i < 3; i++) {
        if (!viewFeed[rec]) return;
        recommendList.innerHTML += renderFeedItem(viewFeed[rec]);
        rec++;
    }
    attachEvents();
}

window.addEventListener('scroll', () => {
    if (window.innerHeight + window.scrollY + 400 >= document.body.offsetHeight) {
        loadRecommend();
    }
});

// MODAL
function openModal(msg) {
    const modal = document.getElementById('modal');
    document.getElementById('modal-text').textContent = msg;
    modal.style.display = 'flex';
}
document.getElementById('modal-close').onclick = () => {
    document.getElementById('modal').style.display = 'none';
};
