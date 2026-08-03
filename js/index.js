/********************************************
 *  INDEX.JS — GALLA v2 (세로형 + 커스텀 진영)
 ********************************************/

/* ── SPA 이중 모드 ─────────────────────────────────────────────
 * MPA(index.html, body[data-page="index"]): 기존처럼 DOMContentLoaded 자동 초기화.
 * SPA 셸(app.html, body[data-page="spa"]): 자동 초기화하지 않고
 *   window.GALLA_PAGE_INDEX.mount(root) 호출을 기다린다(js/spa/views/index.js가 부름).
 * IDXROOT: 피드 DOM 조회 루트. MPA=document, SPA=홈 판(.view-host).
 *   단일문서 SPA에서 다른 탭 판의 .card/.vote-btn 등을 오염시키지 않기 위함. */
const __IDX_MPA = !!(document.body && document.body.dataset.page === 'index');
let IDXROOT = document;

/* 상세 이동 — SPA 셸에선 스택 push(문서 유지·탭 보존), MPA에선 기존 그대로 location 이동 */
window.GALLA_goto = function (url) {
    if (!__IDX_MPA && window.GALLA_SPA && window.GALLA_SPA.push) {
        const m = String(url).match(/^\.?\/?([a-z0-9_-]+)\.html(?:\?([^#]*))?(?:#.*)?$/i);
        if (m) {
            const params = {};
            if (m[2]) new URLSearchParams(m[2]).forEach((v, k) => params[k] = v);
            window.GALLA_SPA.push(m[1], params);
            return;
        }
    }
    location.href = url;
};

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
    if (!vid.paused) return;              // 이미 재생 중이면 재호출 무시(깜빡임 방지)
    vid.muted = true;                     // 항상 음소거로 시작 → iOS 자동재생 허용(리젝트/재시도 없음)
    const p = vid.play();
    if (p && typeof p.then === 'function') {
        p.then(() => {
            // 재생이 시작된 뒤에만 사운드 선호+제스처면 음소거 해제
            if (window.GALLA_soundOn && window.GALLA_soundOn() && window.GALLA_gestured) vid.muted = false;
            if (window.GALLA_syncSoundBtns) window.GALLA_syncSoundBtns();
        }).catch(() => {});
    }
}

// 화면 밖 영상은 src를 안 박아 iOS가 메타데이터를 미리 받지 않도록(느림 방지).
// 뷰포트 근처에 오면 그때 src 주입 → 버퍼링 시작.
function ensureVideoSrc(vid) {
    if (vid._srcReady || !vid.dataset.src) return;
    vid._srcReady = true;
    vid.preload = 'auto';
    // 🎬 인스타식: 단색 어두운 자리 + 로딩 시머 → 영상이 '재생 시작 순간' 페이드인(썸네일 스왑·검은 번쩍임 없음).
    vid.addEventListener('playing', () => {
        vid.classList.add('vp-on');
        const m = vid.closest('.card-media--video'); if (m) m.classList.add('vp-loaded');
    }, { once: true });
    // 데이터가 준비된 순간, 화면에 충분히 보이면 즉시 자동재생(정지프레임=검은화면 iOS 대응).
    vid.addEventListener('loadeddata', () => {
        // 캐러셀 영상은 syncCarouselVideos가 활성 슬라이드만 재생 → 여기선 자동재생 안 함
        if (vid.classList.contains('carousel-vid')) return;
        const r = vid.getBoundingClientRect(), vh = window.innerHeight || 0;
        const vis = r.height ? (Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) / r.height) : 0;
        if (vis > 0.5 && vid.paused && !document.body.classList.contains('shorts-open')) playWithSound(vid);
    }, { once: true });
    // 캐러셀 영상: HLS가 늦게 붙어 첫 play()가 거부되던 문제 → 재생 가능 시점에 '활성 슬라이드면' 재시도.
    if (vid.classList.contains('carousel-vid')) {
        vid.addEventListener('canplay', () => {
            if (vid.__wantPlay && vid.paused && !document.body.classList.contains('shorts-open')) playWithSound(vid);
        });
    }
    // Cloudflare Stream HLS(.m3u8): iOS 네이티브 / 그 외 hls.js. 일반 mp4는 src.
    if (window.GALLA_attachHls) window.GALLA_attachHls(vid, vid.dataset.src);
    else { vid.setAttribute('src', vid.dataset.src); try { vid.load(); } catch (e) {} }
}

/* 홈 판을 떠날 때(다른 탭으로 전환) 모든 영상 정지·음소거 —
   릴스/인라인 영상이 백그라운드에서 소리를 계속 흘리던 문제(사장님 제보) 차단.
   셸이 '비활성' 신호를 쏘고, 앱이 백그라운드로 가도(visibilitychange) 동일 처리. */
function pauseAllVideos() {
    IDXROOT.querySelectorAll('video').forEach(v => {
        try { v.pause(); v.muted = true; } catch (e) {}
    });
    if (window.GALLA_syncSoundBtns) window.GALLA_syncSoundBtns();
}
// 홈으로 돌아오면 가장 많이 보이는 피드 영상 재생 재개(셸은 transform으로 판을 밀어 IO가 다시 안 쏨)
function resumeVisibleVideo() {
    if (document.body.classList.contains('shorts-open')) return;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    let best = null, bestVis = 0;
    IDXROOT.querySelectorAll('.card-media video').forEach(v => {
        if (v.classList.contains('carousel-vid')) return;
        const r = v.getBoundingClientRect(); if (!r.height) return;
        const ratio = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) / r.height;
        if (ratio > 0.5 && ratio > bestVis) { bestVis = ratio; best = v; }
    });
    if (best) { ensureVideoSrc(best); if (best.paused) playWithSound(best); }
    syncCarouselVideos();
}
window.addEventListener('message', (e) => {
    const m = e.data;
    if (!m || m.galla !== 'shellcmd') return;
    if (m.t === 'inactive') pauseAllVideos();
    else if (m.t === 'active') resumeVisibleVideo();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseAllVideos(); });

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

// IntersectionObserver 폴백(일부 환경/브라우저에서 IO가 콜백을 안 쏘는 경우 영상이 영영 안 뜸).
// 스크롤/리사이즈에 맞춰 뷰포트 근처 영상 src 주입 + 가장 많이 보이는 영상 재생.
let __feedVideoFallbackBound = false;
function ensureFeedVideoFallback() {
    const sweep = () => {
        const vh = window.innerHeight || document.documentElement.clientHeight;
        let best = null, bestVis = 0;
        IDXROOT.querySelectorAll('.card-media video').forEach(v => {
            if (v.classList.contains('carousel-vid')) return;   // 캐러셀 영상=syncCarouselVideos 전담
            const r = v.getBoundingClientRect();
            if (!r.height) return;
            if (r.top < vh + 700 && r.bottom > -700) ensureVideoSrc(v);        // 넉넉히 미리 버퍼(깜빡임 방지)
            const ratio = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) / r.height;
            // 화면 밖(35% 미만)만 정지 — 보이는 영상은 건드리지 않아 깜빡임 없음
            if (ratio < 0.35) { if (!v.paused) v.pause(); }
            if (ratio > 0.5 && ratio > bestVis) { bestVis = ratio; best = v; }
        });
        if (best && best.paused && !document.body.classList.contains('shorts-open')) playWithSound(best);
        syncCarouselVideos();
    };
    if (!__feedVideoFallbackBound) {
        __feedVideoFallbackBound = true;
        let t; const onScroll = () => { clearTimeout(t); t = setTimeout(sweep, 100); };
        // capture: SPA에선 .view-host 내부 스크롤이 window로 버블되지 않음 — 캡처로 잡는다(MPA 동작 동일)
        window.addEventListener('scroll', onScroll, { passive: true, capture: true });
        window.addEventListener('resize', onScroll, { passive: true });
    }
    sweep();
    setTimeout(sweep, 300);
    setTimeout(sweep, 1000);
}

// 개별 음소거 토글 → 재생 중 영상의 실제 음소거 상태 기준 토글(선호와 어긋남 방지)
window.toggleFeedMute = function (vidId, btnId) {
    const v = document.getElementById(vidId);
    window.GALLA_setSound(v ? v.muted : !window.GALLA_soundOn());
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
    syncCarouselVideos();   // 활성 슬라이드 영상만 재생/나머지 정지
}

/* 캐러셀 영상 재생 단일 제어 — 각 캐러셀에서 '현재 활성 슬라이드'가 영상이고
   카드가 세로로 충분히 보일 때만 재생. 오프스크린(가로로 밀린) 슬라이드·비활성 카드는 정지.
   (일반 피드 영상 sweep은 .carousel-vid를 건드리지 않음 → 이중제어/전부재생 방지) */
function syncCarouselVideos() {
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const shortsOpen = document.body.classList.contains('shorts-open');
    IDXROOT.querySelectorAll('.carousel-wrap').forEach(wrap => {
        const card = wrap.closest('.card');
        const st = carouselState[Number(card && card.dataset.id)];
        const r = wrap.getBoundingClientRect();
        const vis = r.height ? (Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) / r.height) : 0;
        wrap.querySelectorAll('.carousel-slide').forEach((s, i) => {
            const v = s.querySelector('video.carousel-vid');
            if (!v) return;
            const active = st && st.idx === i && vis > 0.5 && !shortsOpen;
            v.__wantPlay = active;   // canplay 재시도용(HLS 늦게 붙어도 준비되면 재생)
            if (active) { ensureVideoSrc(v); if (v.paused) playWithSound(v); }
            else if (!v.paused) { v.pause(); }
        });
    });
}

/* 슬라이드 폭을 측정한 px로 못박음 — 모바일 사파리/크롬에서 flex-basis:100% 순환 참조로
   슬라이드가 이미지 원본/3배 폭이 돼 한 장이 여러 칸에 걸쳐 보이던 문제 원천 차단 */
function sizeAllCarousels() {
    IDXROOT.querySelectorAll('.carousel-wrap').forEach(wrap => {
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
    const T = (u, w) => (window.GALLA_thumb ? window.GALLA_thumb(u, w || 1080) : u);
    const media = (window.GALLA_issueMedia ? window.GALLA_issueMedia(data) : []) || [];

    if (!media.length) {
        return `<div class="card-media"><span class="card-media-empty">이미지 없음</span></div>`;
    }

    // 단일 영상 — 기존 인라인 자동재생 카드 그대로(회귀 방지)
    if (media.length === 1 && media[0].type === 'video') {
        const m = media[0];
        return `
        <div class="card-media card-media--video"
             onclick="event.stopPropagation();openReels(${data.id})">
            <video id="vid-${data.id}" class="vp-fade" data-src="${m.url}"
                ${m.thumb ? `poster="${T(m.thumb)}"` : ''}
                autoplay loop playsinline webkit-playsinline muted preload="none"></video>
            <div class="vid-dur" id="dur-${data.id}">-:--</div>
            <button class="vid-mute" id="mute-${data.id}"
                    onclick="event.stopPropagation();toggleFeedMute('vid-${data.id}','mute-${data.id}')">${window.GALLA_muteIcon ? window.GALLA_muteIcon(!(window.GALLA_soundOn && window.GALLA_soundOn())) : "🔇"}</button>
            <span class="vid-reels-badge">▶︎ 릴스로 보기</span>
        </div>`;
    }

    // 단일 사진
    if (media.length === 1 && media[0].type === 'image') {
        return `<div class="card-media"><img src="${T(media[0].url)}" loading="lazy" alt=""></div>`;
    }

    // 혼합/다중 → 캐러셀 (영상 슬라이드는 포스터+▶, 탭하면 이슈 상세에서 재생)
    const total = media.length;
    carouselState[data.id] = { idx: 0, total };
    const dotsHtml = media.map((_, i) => `<div class="carousel-dot ${i === 0 ? 'on' : ''}"></div>`).join('');
    const slidesHtml = media.map((m, i) => {
        if (m.type === 'video') {
            const vid = `cvid-${data.id}-${i}`, mid = `cmute-${data.id}-${i}`;
            // 활성 슬라이드만 인라인 자동재생(단일영상 카드와 동일 감성). 탭=릴스 풀스크린.
            return `<div class="carousel-slide carousel-slide--video"
                 onclick="event.stopPropagation();openReels(${data.id})">
                ${m.thumb ? `<img class="cvid-bg" src="${T(m.thumb, 480)}" aria-hidden="true" alt="">` : ''}
                <video id="${vid}" class="carousel-vid vp-fade" data-src="${m.url}"
                    ${m.thumb ? `poster="${T(m.thumb)}"` : ''}
                    loop playsinline webkit-playsinline muted preload="none"></video>
                <button class="vid-mute" id="${mid}"
                        onclick="event.stopPropagation();toggleFeedMute('${vid}','${mid}')">${window.GALLA_muteIcon ? window.GALLA_muteIcon(!(window.GALLA_soundOn && window.GALLA_soundOn())) : "🔇"}</button>
                <span class="vid-reels-badge">▶︎ 릴스로 보기</span>
            </div>`;
        }
        return `<div class="carousel-slide"><img src="${T(m.url)}" loading="eager" decoding="async"></div>`;
    }).join('');
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

/* ===========================
 * 카드 렌더러
 * =========================== */
const moreIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`;

// 유튜브식 숫자 축약 (1234→1.2천, 12345→1.2만)
function formatK(n) {
    n = Number(n) || 0;
    if (n < 1000) return String(n);
    if (n < 10000) return (n / 1000).toFixed(n < 10000 && n % 1000 >= 100 ? 1 : 0).replace(/\.0$/, '') + '천';
    if (n < 100000000) return (n / 10000).toFixed(n % 10000 >= 1000 ? 1 : 0).replace(/\.0$/, '') + '만';
    return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '억';
}
window.GALLA_formatK = formatK;

/* 피드 액션 아이콘 — 전부 인라인 SVG로 통일한다.
   (예전엔 하트만 SVG, 나머지는 <img>라 굵기·크기·베이스라인이 제각각이었다)
   24×24 viewBox · stroke 1.8 · round cap/join 으로 광학 무게를 맞춤. */
const heartSvg = `<svg viewBox="0 0 24 24" class="fi-ic lk-ic" aria-hidden="true"><path d="M12 20.3l-1.4-1.3C5.4 14.4 2 11.3 2 7.5 2 4.4 4.4 2 7.5 2c1.7 0 3.4.8 4.5 2.1C13.1 2.8 14.8 2 16.5 2 19.6 2 22 4.4 22 7.5c0 3.8-3.4 6.9-8.6 11.5L12 20.3z"/></svg>`;
const commentSvg = `<svg viewBox="0 0 24 24" class="fi-ic" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.6 8.6 0 0 1-3.9-.9L3.5 20.5l1.4-5.1a8.4 8.4 0 0 1-.9-3.9A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z"/></svg>`;
const bookmarkSvg = `<svg viewBox="0 0 24 24" class="fi-ic" aria-hidden="true"><path d="M18 21l-6-4.3L6 21V5.5A2.5 2.5 0 0 1 8.5 3h7A2.5 2.5 0 0 1 18 5.5V21z"/></svg>`;
const shareSvg = `<svg viewBox="0 0 24 24" class="fi-ic" aria-hidden="true"><path d="M21.5 2.5L10.8 13.2"/><path d="M21.5 2.5l-6.8 19-3.9-8.3-8.3-3.9 19-6.8z"/></svg>`;
// 🤖 갈비스 아이콘(미니 아크 리액터) — 액션바 끝, 탭하면 이 콘텐츠 얘기로 갈비스와 대화(SPA 전용, friend.js가 위임 처리)
const galvisSvg = `<svg viewBox="0 0 24 24" class="fi-ic gv-galvis" aria-hidden="true" fill="none"><circle cx="12" cy="12" r="8.2" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.3 2.2"/><circle cx="12" cy="12" r="4.7" stroke="currentColor" stroke-width="1.3"/><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/></svg>`;
const galvisBtn = (type, id, title) => (document.body && document.body.dataset.page === 'spa')
  ? `<button type="button" class="fi-btn galvis-btn" data-galvis data-gv-type="${type}" data-gv-id="${id}" data-gv-title="${String(title || '').replace(/"/g, '&quot;').slice(0, 120)}" aria-label="갈비스와 얘기">${galvisSvg}</button>`
  : '';

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
                    <div class="mah-line2">${data.pinned ? '<span class="pin-chip">📌 부스트</span> ' : ''}${data.category} · ${data.time} · 조회 ${formatK(data.views)}</div>
                </div>
            </div>
            ${data.user_id ? `<button class="follow-btn" data-uid="${data.user_id}">+ 팔로우</button>` : ''}
        </div>

        ${renderMedia(data)}

        <div class="card-body">
            <div class="card-title">${data.title}</div>
            ${data.oneLine ? `<div class="card-desc">${data.oneLine}</div>` : ''}

            <div class="gv">${window.GALLA_VoteBar ? window.GALLA_VoteBar.html({ factionA, factionB, pro: data.pro, con: data.con, proClass: 'vote-btn', conClass: 'vote-btn', proAttr: 'data-type="pro"', conAttr: 'data-type="con"' }) : ''}</div>

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
                    <button type="button" class="fi-btn like-btn" data-id="${data.id}" data-likes="${data.likes || 0}" aria-label="좋아요">${heartSvg}<span class="lk-count">${data.likes ? formatK(data.likes) : ''}</span></button>
                    <button type="button" class="fi-btn goto-comments" aria-label="댓글">${commentSvg}</button>
                    <button type="button" class="fi-btn bookmark-btn" data-id="${data.id}" aria-label="저장">${bookmarkSvg}</button>
                    <button type="button" class="fi-btn share-btn" data-id="${data.id}" aria-label="공유">${shareSvg}</button>
                    ${galvisBtn('issue', data.id, data.title)}
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
    IDXROOT.querySelectorAll('.card-media video').forEach(v => v.pause());
    if (typeof window.openShorts === 'function') {
        window.openShorts(vids, Number(startId), startTime, 'feed');
    } else {
        window.GALLA_goto(`issue.html?id=${startId}`);
    }
};

/* ===========================
 * 투표 UI
 * =========================== */
async function applyVoteUI(cardEl, stance) {
    const gv = cardEl.querySelector('.gv');
    if (gv && window.GALLA_VoteBar) window.GALLA_VoteBar.setMine(gv, stance);
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
    likes: new Set(),       // 내가 좋아요한 issue_id (문자열)
    loaded: false
};

async function initSocial() {
    const supabase = window.supabaseClient;
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (user) {
        social.userId = user.id;
        const [f, b, l] = await Promise.all([
            supabase.from('follows').select('following').eq('follower', user.id),
            supabase.from('bookmarks').select('issue_id').eq('user_id', user.id),
            supabase.from('issue_likes').select('issue_id').eq('user_id', user.id)
        ]);
        f.data?.forEach(r => social.follows.add(r.following));
        b.data?.forEach(r => social.bookmarks.add(String(r.issue_id)));
        l.data?.forEach(r => social.likes.add(String(r.issue_id)));
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
    IDXROOT.querySelectorAll('.follow-btn[data-uid]').forEach(btn => {
        if (social.userId && btn.dataset.uid === social.userId) {
            btn.style.display = 'none';
            return;
        }
        setFollowUI(btn, social.follows.has(btn.dataset.uid));
    });
    IDXROOT.querySelectorAll('.bookmark-btn').forEach(img => {
        img.classList.toggle('active', social.bookmarks.has(img.dataset.id));
    });
    IDXROOT.querySelectorAll('.like-btn').forEach(btn => {
        btn.classList.toggle('on', social.likes.has(btn.dataset.id));
    });
}

async function toggleLike(btn) {
    if (!social.userId) return window.GALLA_needLogin ? window.GALLA_needLogin('로그인이 필요해요.') : openModal('로그인이 필요합니다.');
    const supabase = window.supabaseClient;
    const id = btn.dataset.id;
    const on = social.likes.has(id);
    const cEl = btn.querySelector('.lk-count');
    const base = Number(btn.dataset.likes) || 0;
    const next = Math.max(0, base + (on ? -1 : 1));
    // 낙관적 토글 (모든 동일 id 카드 동기화)
    if (on) social.likes.delete(id); else social.likes.add(id);
    IDXROOT.querySelectorAll(`.like-btn[data-id="${id}"]`).forEach(b => {
        b.dataset.likes = next;
        b.classList.toggle('on', !on);
        const c = b.querySelector('.lk-count'); if (c) c.textContent = next ? formatK(next) : '';
    });
    if (!on) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); }

    const { error } = on
        ? await supabase.from('issue_likes').delete().eq('user_id', social.userId).eq('issue_id', Number(id))
        : await supabase.from('issue_likes').insert({ user_id: social.userId, issue_id: Number(id) });
    if (error && error.code !== '23505') {
        if (on) social.likes.add(id); else social.likes.delete(id);
        IDXROOT.querySelectorAll(`.like-btn[data-id="${id}"]`).forEach(b => {
            b.dataset.likes = base;
            b.classList.toggle('on', on);
            const c = b.querySelector('.lk-count'); if (c) c.textContent = base ? formatK(base) : '';
        });
    }
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
    IDXROOT.querySelectorAll('.vote-btn').forEach(btn => {
        btn.onclick = async e => {
            e.stopPropagation();
            if (document.body.classList.contains('shorts-open')) return;
            const type = btn.dataset.type;
            const card = btn.closest('.card');
            const id = Number(card.dataset.id);
            if (typeof window.GALLA_VOTE !== 'function') return;
            const gv = card.querySelector('.gv');
            // 0) 로그인 필수 — 팝업 없이 '바로' 로그인 페이지로(사장님 확정). 셸이면 최상위 이동.
            {
                let uid = null;
                try { const { data: s } = await window.supabaseClient.auth.getSession(); uid = s?.session?.user?.id || null; } catch (e2) {}
                if (!uid) {
                    const go = 'login.html?next=' + encodeURIComponent('index.html');
                    try { if (window.parent && window.parent !== window) window.parent.postMessage({ galla: 'shell', t: 'goto', url: go }, location.origin); } catch (e2) {}
                    try { (window.top || window).location.href = go; } catch (e2) {}
                    setTimeout(function () { try { location.href = go; } catch (e2) {} }, 400);
                    return;
                }
            }
            // 0-1) 이미 투표했으면 서버 기준으로 잠금+안내 후 중단(변경 불가)
            if (gv && window.GALLA_VoteBar && await window.GALLA_VoteBar.guardLocked(gv, id)) return;
            // 1) 낙관적 즉시 반영(첫 클릭에도 바로 움직임)
            if (gv && window.GALLA_VoteBar) window.GALLA_VoteBar.applyVote(gv, type);
            // 2) 실제 투표 + 서버 수치로 수렴
            const stance = await window.GALLA_VOTE(id, type);
            if (gv && window.GALLA_VoteBar && typeof window.GALLA_GET_VOTE_STATS === 'function') {
                const s = await window.GALLA_GET_VOTE_STATS(id);
                if (s) window.GALLA_VoteBar.update(gv, s, { myStance: stance || type, animate: false });
            }
        };
    });

    // 모달
    IDXROOT.querySelectorAll('.open-modal').forEach(el => {
        el.onclick = e => {
            e.stopPropagation();
            openModal(el.dataset.msg);
        };
    });

    // 팔로우
    IDXROOT.querySelectorAll('.follow-btn[data-uid]').forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();
            toggleFollow(btn);
        };
    });

    // 좋아요
    IDXROOT.querySelectorAll('.like-btn').forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();
            toggleLike(btn);
        };
    });

    // 북마크
    IDXROOT.querySelectorAll('.bookmark-btn').forEach(img => {
        img.onclick = e => {
            e.stopPropagation();
            toggleBookmark(img);
        };
    });

    // 공유
    IDXROOT.querySelectorAll('.share-btn').forEach(img => {
        img.onclick = e => {
            e.stopPropagation();
            shareIssue(img.dataset.id);
        };
    });

    // ⋯ 더보기: 소유자·관리자 → 수정/삭제, 아니면 → 신고/차단
    IDXROOT.querySelectorAll('.card-more').forEach(btn => {
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
                    onBlocked: () => { IDXROOT.querySelectorAll('.card').forEach(c => { if (window.cards?.find(x => String(x.id) === c.dataset.id)?.user_id === uid) c.remove(); }); },
                });
            }
        };
    });

    // 전황표 → 이슈 댓글
    IDXROOT.querySelectorAll('.goto-comments').forEach(el => {
        el.onclick = e => {
            e.stopPropagation();
            const card = el.closest('.card');
            window.GALLA_goto(`issue.html?id=${card.dataset.id}#battle-zone`);
        };
    });

    // 예측 카드 클릭 → 예측 상세 (위임: innerHTML+= 재렌더로 리스너 유실되는 문제 방지)
    if (!window.__predictClickDelegated) {
        window.__predictClickDelegated = true;
        document.addEventListener('click', e => {
            const c = e.target.closest('.predict-feed-card');
            if (c && c.dataset.mid) {
                window.GALLA_goto(`predict-market.html?id=${c.dataset.mid}`);
            }
        });
    }

    // 카드 전체 클릭
    IDXROOT.querySelectorAll('.card').forEach(card => {
        if (card.__navBound) return;   // attachEvents 반복 호출 시 중복 리스너 방지(SPA면 push 중복 방지)
        card.__navBound = true;
        card.addEventListener('click', e => {
            const url = card.dataset.link;
            if (url) window.GALLA_goto(url);
        });
    });

    // 캐러셀 터치 스와이프 — 손가락 추적 라이브 드래그(인스타 스타일)
    IDXROOT.querySelectorAll('.carousel-wrap').forEach(wrap => {
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
    IDXROOT.querySelectorAll('.card-media video').forEach(v => {
        if (v.classList.contains('carousel-vid')) return;   // 캐러셀 영상=활성 슬라이드만 syncCarouselVideos가 버퍼
        // 재생/정지는 sweep(ensureFeedVideoFallback) 단일 제어 → 관찰자와 경쟁 제거(깜빡임 방지).
        videoPreloader.observe(v);   // 미리 버퍼링만
        v.addEventListener('loadedmetadata', () => {
            const t = Math.floor(v.duration);
            const dur = document.getElementById(`dur-${v.id.replace('vid-', '')}`);
            if (dur) dur.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
        });
    });
    // 🎥 안전 폴백: IntersectionObserver가 안 먹는 환경 대비 — 스크롤 시 뷰포트 근처 영상 src 주입 +
    // 중앙(>50%) 영상 재생/나머지 정지. (영상이 아예 안 뜨던 문제 방지)
    ensureFeedVideoFallback();

    // 투표 상태 복원
    if (typeof window.GALLA_CHECK_VOTE === 'function') {
        IDXROOT.querySelectorAll('.card').forEach(cardEl => {
            syncVoteWithRetry(cardEl, Number(cardEl.dataset.id));
        });
    }

    // 팔로우/북마크 상태 복원 (무한 스크롤로 추가된 카드 포함)
    applySocialState();
}

/* ===========================
 * 데이터 로드
 * =========================== */
async function initIndexPage() {
    bestList = IDXROOT.querySelector('#best-list');
    recommendList = IDXROOT.querySelector('#recommend-list');
    bestMore = IDXROOT.querySelector('#best-more');

    while (!window.supabaseClient) {
        await new Promise(r => setTimeout(r, 30));
    }
    initHeader();
    initSocial();
    if (window.initNotifications) window.initNotifications();
    try { await loadData(); }
    finally { GALLA_signalReady(); }  // 실패해도 스플래시는 반드시 내린다
}
// MPA(index.html)에서만 자동 초기화 — SPA 셸에선 GALLA_PAGE_INDEX.mount()가 부른다
if (__IDX_MPA) document.addEventListener('DOMContentLoaded', initIndexPage);

/* 스플래시 해제 신호 — splash-boot이 galla:ready 를 기다린다. 중복 호출 무해. */
function GALLA_signalReady() {
    if (window.__gallaReadySent) return;
    window.__gallaReadySent = true;
    try { window.dispatchEvent(new Event('galla:ready')); } catch (_) {}
}

/* 헤더: + 글쓰기(권한 게이팅) / ♥ 알림 */
function initHeader() {
    // + 글쓰기: '새로 만들기' 선택 페이지로 (시트 폐지, 2026-07-23 사장님 확정).
    // 실제 바인딩은 write-hub.js 공용(#hdrWrite→create.html, 셸이면 최상위)이 담당 — 여기선 중복 바인딩 금지.
    // ♥ 알림 클릭은 notifications.js가 바인딩
}

// 홈은 항상 '맨 위(로고 보이는 상태)'에서 시작한다 — 스크롤 복원 폐지(사용자 확정).
// 브라우저 자체 복원(reload/bfcache)도 차단하고, 과거 저장값도 제거.
if (__IDX_MPA) {   // SPA 셸에선 스크롤 컨테이너가 window가 아니고, 전역 history 설정도 셸 몫
    try { history.scrollRestoration = 'manual'; } catch (_) {}
    try { localStorage.removeItem('scrollPos'); } catch (_) {}
    window.scrollTo(0, 0);
    window.addEventListener('pageshow', () => window.scrollTo(0, 0));
}

async function loadData() {
    const supabase = window.supabaseClient;

    // 타 콘텐츠(예측·광장·뉴스·영상·일기토)는 이슈와 독립 — 지금 바로 병렬 시작.
    // (예전엔 이슈 체인이 다 끝난 뒤에야 시작해 첫 렌더가 ~4초까지 밀렸다)
    const extrasP = Promise.all([
        loadPredictionCards(),
        loadPlazaCards(),
        loadNewsCards(),
        loadVideoCards(),
        loadDuelCards()
    ]);

    let { data: issues, error } = await supabase
        .from('issues')
        .select(`
            id, title, one_line, category, created_at,
            pro_count, con_count, sup_pro, sup_con, view_count, like_count,
            user_id, thumbnail_url, video_url, images, media,
            faction_a, faction_b
        `)
        .order('created_at', { ascending: false })
        .limit(80);

    if (error) { console.error(error); return; }

    // 차단한 사용자의 갈라는 피드에서 제외
    let issuesF = issues;
    if (window.GALLA_blockedIds) {
        try { const blocked = await window.GALLA_blockedIds(); if (blocked.size) issuesF = issues.filter(i => !blocked.has(i.user_id)); } catch (_) {}
    }
    issues = issuesF;

    const userIds = [...new Set(issues.map(i => i.user_id).filter(Boolean))];
    const issueIds = issues.map(i => i.id);

    // 작성자·부스트·전황·내투표 — 예전 직렬 4단계(RTT×4)를 한 번에 병렬로
    const [profilesRes, pinsRes, warMap] = await Promise.all([
        supabase.from('users').select('id, nickname, level, avatar_url').in('id', userIds),
        supabase.from('content_boosts').select('target_id').eq('kind', 'pin').gt('until', new Date().toISOString()).then(r => r, () => ({ data: null })),
        loadWarData(issueIds),
        window.GALLA_PREFETCH_VOTES ? window.GALLA_PREFETCH_VOTES(issueIds) : Promise.resolve()
    ]);
    const profiles = profilesRes.data;

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
        views: row.view_count || 0,
        likes: row.like_count || 0,
        thumb: row.thumbnail_url,
        video_url: row.video_url,
        media: row.media,   // 🎠 혼합 캐러셀(정규화기가 소비)
        thumbnail_url: row.thumbnail_url,
        faction_a: row.faction_a,
        faction_b: row.faction_b,
        images: Array.isArray(row.images) && row.images.length > 0
            ? row.images
            : (row.thumbnail_url ? [row.thumbnail_url] : [])
    }));

    // 🚀 부스트: 24h 상단 고정된 이슈를 맨 앞으로 + 배지 (위 병렬 쿼리 결과 사용)
    const pinSet = new Set((pinsRes?.data || []).map(p => Number(p.target_id)));
    if (pinSet.size) {
        cards.forEach(c => { if (pinSet.has(Number(c.id))) c.pinned = true; });
        cards.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    }

    cards = cards.map(c => ({ ...c, war: warMap[c.id] }));
    window.cards = cards;

    // 1차 렌더: 이슈만으로 즉시 그린다 — 타 콘텐츠를 기다리지 않음
    feed = cards.map(c => ({ type: 'issue', data: c }));
    window.feed = feed;
    viewFeed = feed;
    loadBest();
    loadRecommend();
    // 🚪 스플래시 해제 신호 — 화면에 '진짜 콘텐츠'가 처음 그려진 바로 이 순간.
    //    (window.load로 내리면 피드 도착 전 빈 화면이 노출됨)
    GALLA_signalReady();

    // 타 콘텐츠 도착하면 교차 배열로 병합하고, 이미 표시된 개수만큼 다시 그림
    extrasP.then(([predictionCards, plazaCards, newsCards, videoCards, duelCards]) => {
        feed = interleave(cards, {
            predict: predictionCards, plaza: plazaCards,
            news: newsCards, video: videoCards, duel: duelCards
        });
        window.feed = feed;
        // 그 사이 카테고리 칩을 골랐다면 새 피드 기준으로 필터 재적용
        const activeCat = IDXROOT.querySelector('.category-section .chip.active')?.textContent?.trim() || '전체';
        viewFeed = (activeCat === '전체') ? feed : feed.filter(it => (it.data && it.data.category) === activeCat);
        const shown = rec;
        rec = 3;
        if (recommendList) recommendList.innerHTML = '';
        loadBest();
        while (rec < shown && viewFeed[rec]) loadRecommend();
    }).catch(() => {});
}

// 인덱스 카테고리 칩 — 검색페이지로 이동하지 않고 '그 자리에서' 피드를 필터
window.GALLA_filterFeed = function (cat, el) {
    IDXROOT.querySelectorAll('.category-section .chip').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
    viewFeed = (!cat || cat === '전체') ? feed : feed.filter(it => (it.data && it.data.category) === cat);
    rec = 3;
    if (recommendList) recommendList.innerHTML = '';
    loadBest();
    loadRecommend();
    if (bestList && !viewFeed.length) bestList.innerHTML = '<div class="feed-empty" style="padding:40px 16px;text-align:center;color:var(--muted,#8a8f9a);font-size:14px">이 카테고리엔 아직 갈라가 없어요.</div>';
    // SPA에선 스크롤 컨테이너가 view-host — MPA면 window 그대로
    (IDXROOT !== document ? IDXROOT : window).scrollTo({ top: 0, behavior: 'smooth' });
};

// Fisher–Yates 셔플 — 이슈 외 콘텐츠는 진입할 때마다 새 배치로 보이게
function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// 이슈(시간순 고정) 사이사이에 타 콘텐츠를 라운드로빈으로 끼워 배치
// — 일기토 라이브는 최상단 근처, 순환 순서 자체도 매 진입 랜덤
function interleave(issues, ex = {}) {
    const queue = [];
    (ex.duel || []).forEach(d => queue.push({ type: 'duel', data: d }));
    const order = shuffle(['news', 'predict', 'video', 'plaza']);
    const idx = { news: 0, predict: 0, video: 0, plaza: 0 };
    let added = true;
    while (added) {
        added = false;
        for (const t of order) {
            const arr = ex[t] || [];
            if (idx[t] < arr.length) { queue.push({ type: t, data: arr[idx[t]++] }); added = true; }
        }
    }
    const out = [];
    issues.forEach(c => {
        out.push({ type: 'issue', data: c });
        if (queue.length) out.push(queue.shift());
    });
    while (queue.length) out.push(queue.shift());
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
    // 작성자 배지(아바타·등급)용 프로필 프리페치
    if (window.GALLA_userMap) await window.GALLA_userMap(posts.map(p => p.user_id));
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
    <div class="card plaza-card" onclick="GALLA_goto('plaza_detail.html?id=${p.id}')">
      <div class="pz-head">
        <span class="pz-badge">🏛 광장</span>
        <span class="pz-cat">${cat}</span>
        <span class="pz-author">${p.user_id && window.GALLA_userBadge
            ? window.GALLA_userBadge(p.user_id, p.nickname)
            : escHtml(p.nickname || '익명')}</span>
      </div>
      <div class="pz-body">
        <div class="pz-text">
          <div class="pz-title">${escHtml(p.title || '(제목 없음)')}</div>
          ${excerpt ? `<div class="pz-excerpt">${escHtml(excerpt)}</div>` : ''}
        </div>
        ${cover ? `<div class="pz-thumb"><img src="${escHtml(window.GALLA_thumb ? window.GALLA_thumb(cover, 720) : cover)}" loading="lazy" alt="" style="opacity:0;transition:opacity .18s" onload="this.style.opacity=1" onerror="this.closest('.pz-thumb')?.remove()"></div>` : ''}
      </div>
      <div class="pz-foot">
        <span>👍 ${p.up_count || 0}</span>
        <span>👁 ${p.view_count || 0}</span>
        <span class="pz-go">글 보기 ›</span>
      </div>
    </div>`;
}

/* ── 갈라뉴스 카드 ── */
async function loadNewsCards() {
    const supabase = window.supabaseClient;
    const { data: rows } = await supabase
        .from('galla_news')
        .select('id, title, summary, category, hero_image, source_count, view_count, published_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(30);
    if (!rows || !rows.length) return [];
    const now = Date.now();
    const scored = rows.map(n => {
        const ageH = (now - new Date(n.published_at)) / 3600000;
        const fresh = ageH < 6 ? 60 : ageH < 24 ? 30 : 0;
        return { ...n, _score: (n.view_count || 0) * 0.5 + (n.source_count || 0) * 4 + fresh + Math.random() * 10 };
    }).sort((a, b) => b._score - a._score).slice(0, 12);
    return shuffle(scored);   // 진입마다 새 배치
}

function renderNewsCard(n) {
    const hero = plazaProxify(n.hero_image || '');
    const sum = (n.summary || '').slice(0, 90);
    return `
    <div class="card news-feed-card" onclick="GALLA_goto('news.html?gn=${n.id}')">
      ${hero ? `<div class="nf-hero"><img src="${escHtml(hero)}" loading="lazy" alt="" referrerpolicy="no-referrer" onerror="this.closest('.nf-hero')?.remove()"></div>` : ''}
      <div class="nf-body">
        <div class="nf-head">
          <span class="nf-badge">📰 갈라뉴스</span>
          <span class="nf-cat">${escHtml(n.category || '')}</span>
          ${n.source_count ? `<span class="nf-src">출처 ${n.source_count}곳 종합</span>` : ''}
        </div>
        <div class="nf-title">${escHtml(n.title)}</div>
        ${sum ? `<div class="nf-sum">${escHtml(sum)}</div>` : ''}
        <div class="nf-foot"><span>👁 ${(n.view_count || 0).toLocaleString('ko-KR')}</span><span class="nf-go">기사 보기 ›</span></div>
      </div>
    </div>`;
}

/* ── 핫트렌드 영상 카드 ── */
function fmtViews(v) {
    v = Number(v) || 0;
    if (v >= 100000000) return (v / 100000000).toFixed(1).replace(/\.0$/, '') + '억';
    if (v >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, '') + '만';
    return v.toLocaleString('ko-KR');
}
async function loadVideoCards() {
    const supabase = window.supabaseClient;
    const { data: rows } = await supabase
        .from('youtube_hot')
        .select('video_id, title, channel_title, thumbnail, view_count, rank, is_short, collected_at')
        .order('collected_at', { ascending: false })
        .limit(80);
    if (!rows || !rows.length) return [];
    // 최신 수집분만 + video_id 중복 제거, 상위 랭크 풀에서 랜덤 추출(진입마다 새 얼굴)
    const latest = rows[0].collected_at;
    const seen = new Set();
    const pool = rows
        .filter(v => v.collected_at === latest && !seen.has(v.video_id) && seen.add(v.video_id))
        .sort((a, b) => (a.rank || 99) - (b.rank || 99))
        .slice(0, 18);
    return pool.sort(() => Math.random() - 0.5).slice(0, 6);
}

function renderVideoCard(v) {
    return `
    <div class="card video-feed-card" onclick="GALLA_goto('search.html?video=${encodeURIComponent(v.video_id)}')">
      <div class="vf-thumb">
        <img src="${escHtml(v.thumbnail || '')}" loading="lazy" alt="" onerror="this.style.display='none'">
        <span class="vf-play">▶</span>
        ${v.rank ? `<span class="vf-rank">${v.rank}위</span>` : ''}
        ${v.is_short ? `<span class="vf-short">쇼츠</span>` : ''}
      </div>
      <div class="vf-body">
        <div class="nf-head"><span class="vf-badge">🔥 핫트렌드</span></div>
        <div class="vf-title">${escHtml(v.title)}</div>
        <div class="vf-sub">${escHtml(v.channel_title || '')} · 조회수 ${fmtViews(v.view_count)}회</div>
      </div>
    </div>`;
}

/* ── 일기토(듀얼) 카드 — 라이브/투표중 우선, 없으면 최근 종전 ── */
async function loadDuelCards() {
    const supabase = window.supabaseClient;
    let { data: rows } = await supabase
        .from('duels')
        .select('id, topic, status, challenger, opponent, vote_challenger, vote_opponent, winner, created_at')
        .in('status', ['live', 'voting'])
        .order('created_at', { ascending: false })
        .limit(3);
    if (!rows || !rows.length) {
        const since = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data: done } = await supabase
            .from('duels')
            .select('id, topic, status, challenger, opponent, vote_challenger, vote_opponent, winner, created_at')
            .eq('status', 'closed').gt('created_at', since)
            .order('created_at', { ascending: false })
            .limit(2);
        rows = done || [];
    }
    if (!rows.length) return [];
    const uids = [...new Set(rows.flatMap(d => [d.challenger, d.opponent]).filter(Boolean))];
    const { data: us } = await supabase.from('users').select('id, nickname').in('id', uids);
    const nick = {}; us?.forEach(u => nick[u.id] = u.nickname);
    return rows.map(d => ({
        ...d,
        chalName: nick[d.challenger] || '도전자',
        oppName: nick[d.opponent] || '상대'
    }));
}

function renderDuelCard(d) {
    const live = d.status === 'live';
    const voting = d.status === 'voting';
    const state = live ? '<span class="df-live">🔴 LIVE</span>'
        : voting ? '<span class="df-voting">🗳 투표 중</span>'
        : `<span class="df-done">종전 · ${d.winner === d.challenger ? escHtml(d.chalName) : d.winner === d.opponent ? escHtml(d.oppName) : '무승부'} 승</span>`;
    const cta = live ? '관전하러 가기 ›' : voting ? '투표하러 가기 ›' : '결과 보기 ›';
    return `
    <div class="card duel-feed-card${live ? ' live' : ''}" onclick="GALLA_goto('duel.html?id=${d.id}')">
      <div class="nf-head"><span class="df-badge">⚔️ 일기토</span>${state}</div>
      <div class="df-topic">${escHtml(d.topic || '자유 일기토')}</div>
      <div class="df-vs">
        <span class="df-name">${escHtml(d.chalName)}</span>
        <span class="df-vsmark">VS</span>
        <span class="df-name">${escHtml(d.oppName)}</span>
      </div>
      <div class="nf-foot"><span>🗳 ${(d.vote_challenger || 0) + (d.vote_opponent || 0)}표</span><span class="nf-go">${cta}</span></div>
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

    // 예언자(작성자) 프로필 로드 — users 정본(아바타 포함), 배지 캐시 공유
    const creatorIds = [...new Set(markets.map(m => m.created_by).filter(Boolean))];
    const profMap = {};
    if (creatorIds.length) {
        if (window.GALLA_userMap) await window.GALLA_userMap(creatorIds);
        creatorIds.forEach(id => { const u = (window.__GU_CACHE || {})[id]; if (u) profMap[id] = u; });
    }

    const pct = o => Math.round(o.pool_no / (o.pool_yes + o.pool_no) * 100);
    return markets.map(m => {
        const list = (byM[m.id] || []).map(o => ({ label: o.label, p: pct(o) }));
        const prof = profMap[m.created_by];
        return {
            ...m,
            outcomes: list,
            creatorName: prof?.nickname || '갈라 예언자',
            creatorLevel: prof?.level ?? 1,
            creatorAvatar: prof?.avatar_url || null
        };
    });
}

/* 홈 피드용 예측 카드 (톤 유지, 명확히 '예측') */
function renderPredictCard(m) {
    const multi = m.market_type === 'multi';
    let body, styleVar = '';
    if (multi) {
        const top = m.outcomes.slice().sort((a, b) => b.p - a.p).slice(0, 3);
        body = `<div class="pf-multi">
            ${top.map(o => `<div class="pf-multi-row" style="--pf-rp:${o.p}%"><span>${escHtml(o.label)}</span><b class="pf-pct" data-cu="${o.p}">0%</b></div>`).join('')}
            ${m.outcomes.length > 3 ? `<div class="pf-more">+${m.outcomes.length - 3}개 선택지</div>` : ''}
        </div>`;
    } else {
        const p = m.outcomes[0] ? m.outcomes[0].p : 50;
        styleVar = ` style="--pf-p:${p}%"`;
        body = `<div class="pf-bar"><div class="pf-bar-yes"></div></div>
            <div class="pf-legend"><span class="pf-yes">👍 YES <span class="pf-pct" data-cu="${p}">0</span>%</span><span class="pf-no">👎 NO <span class="pf-pct" data-cu="${100 - p}">0</span>%</span></div>`;
    }
    const cName = escHtml(m.creatorName || '갈라 예언자');
    const cInit = [...(m.creatorName || '갈').trim()][0] || '갈';
    const cAv = m.creatorAvatar && window.GALLA_avatarSrc
        ? `<img src="${escHtml(window.GALLA_avatarSrc(m.creatorAvatar))}" alt="" onerror="this.style.display='none'" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
        : escHtml(cInit);
    const cAttr = m.created_by ? ` data-user-id="${m.created_by}" data-user-nick="${cName}"` : '';
    return `
    <div class="predict-feed-card" data-mid="${m.id}"${styleVar}>
        <div class="pf-top">
            <span class="pf-badge">🔮 갈라예측</span>
            <span class="pf-cat">${escHtml(m.category || '')}${multi ? ' · 여러 선택지' : ''}</span>
        </div>
        <div class="pf-creator">
            <div class="pf-avatar"${cAttr}>${cAv}</div>
            <div class="pf-cinfo">
                <div class="pf-cline">
                    <span class="pf-cname"${cAttr}>${cName}</span>
                    <span class="pf-ctag">🔮 예언자</span>
                </div>
                <div class="pf-csub">이 판을 연 예언자</div>
            </div>
        </div>
        <div class="pf-q">${escHtml(m.question)}</div>
        ${body}
        <div class="pf-foot">
            <span class="pf-vol">💰 거래량 <b>${(Math.round(m.volume)).toLocaleString('ko-KR')}</b>P</span>
            <span class="pf-go">예측하러 가기 <span class="pf-arrow">›</span></span>
        </div>
    </div>`;
}

/* 예측 카드 등장 애니메이션 + 퍼센트 카운트업 — 뷰포트 진입 시 1회.
   IntersectionObserver 우선, 안 먹는 환경(일부 웹뷰/백그라운드) 대비 스크롤 스윕 폴백 겸용.
   (base가 opacity:0라 절대 안 보이면 안 됨 → 폴백 필수) */
function pfReveal(card) {
    if (!card || card._pfIn) return;
    card._pfIn = true;
    card.classList.add('in');
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.querySelectorAll('.pf-pct').forEach(el => {
        const to = Number(el.dataset.cu) || 0;
        const suffix = el.textContent.trim().endsWith('%') ? '%' : '';
        if (reduce) { el.textContent = to + suffix; return; }
        const t0 = performance.now(), dur = 900;
        (function step(now) {
            const p = Math.min(1, (now - t0) / dur);
            el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))) + suffix;
            if (p < 1) requestAnimationFrame(step);
        })(t0);
    });
}
const pfRevealObserver = ('IntersectionObserver' in window) ? new IntersectionObserver((ents) => {
    ents.forEach(e => { if (e.isIntersecting) { pfRevealObserver.unobserve(e.target); pfReveal(e.target); } });
}, { threshold: 0.3 }) : null;

let __pfSweepBound = false;
function pfSweep() {
    const vh = window.innerHeight || document.documentElement.clientHeight;
    IDXROOT.querySelectorAll('.predict-feed-card:not(.in)').forEach(c => {
        const r = c.getBoundingClientRect();
        if (r.top < vh - 40 && r.bottom > 40) pfReveal(c);   // 화면에 실제로 들어온 카드
    });
}
function pfObserveCards(root) {
    (root || IDXROOT).querySelectorAll('.predict-feed-card:not(.in)').forEach(c => {
        if (pfRevealObserver) pfRevealObserver.observe(c);
    });
    if (!__pfSweepBound) {
        __pfSweepBound = true;
        let t; const on = () => { clearTimeout(t); t = setTimeout(pfSweep, 80); };
        window.addEventListener('scroll', on, { passive: true, capture: true });
        window.addEventListener('resize', on, { passive: true });
    }
    // 초기/삽입 직후 이미 보이는 카드 즉시 반영 + IO 미발화 안전망
    pfSweep();
    setTimeout(pfSweep, 400);
}
function escHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function renderFeedItem(item){
    if (item.type === 'predict') return renderPredictCard(item.data);
    if (item.type === 'plaza') return renderPlazaCard(item.data);
    if (item.type === 'news') return renderNewsCard(item.data);
    if (item.type === 'video') return renderVideoCard(item.data);
    if (item.type === 'duel') return renderDuelCard(item.data);
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
    /* ⚠️ innerHTML += 를 카드마다 반복하면 매번 컨테이너 전체가 재파싱돼
       이미지가 카드 수만큼 다시 그려진다 = 깜빡임(사장님 재현. 스냅샷 캐시로
       지난 화면이 먼저 떠 있으면 더 도드라짐). 문자열로 완성해 한 번에 심는다. */
    const html = viewFeed.slice(0, 3).map(renderFeedItem).join('');
    if (bestList.innerHTML !== html) bestList.innerHTML = html;
    attachEvents();
    pfObserveCards(bestList);
}

let rec = 3;
function loadRecommend() {
    // insertAdjacentHTML: 기존 카드를 재파싱하지 않고 뒤에만 붙는다(innerHTML += 는 전체 깜빡임)
    let html = '';
    for (let i = 0; i < 3; i++) {
        if (!viewFeed[rec]) break;
        html += renderFeedItem(viewFeed[rec]);
        rec++;
    }
    if (html) recommendList.insertAdjacentHTML('beforeend', html);
    attachEvents();
    pfObserveCards(recommendList);
}

window.addEventListener('scroll', () => {
    if (window.innerHeight + window.scrollY + 400 >= document.body.offsetHeight) {
        loadRecommend();
    }
});

// MODAL — SPA 셸엔 #modal 마크업이 없다(#app 밖이라 뷰 추출에서 빠짐) → 없으면 만들어 쓴다
function ensureModal() {
    let modal = document.getElementById('modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal';
        modal.className = 'modal';
        modal.innerHTML = '<div class="modal-content"><p id="modal-text"></p><button id="modal-close">확인</button></div>';
        document.body.appendChild(modal);
    }
    const btn = document.getElementById('modal-close');
    if (btn && !btn.onclick) btn.onclick = () => { modal.style.display = 'none'; };
    return modal;
}
function openModal(msg) {
    const modal = ensureModal();
    document.getElementById('modal-text').textContent = msg;
    modal.style.display = 'flex';
}
// MPA에선 기존처럼 즉시 바인딩(마크업이 이미 있음) — SPA에선 openModal 때 지연 생성
if (document.getElementById('modal-close')) ensureModal();

/* ═══ SPA 어댑터 — js/spa/views/index.js(뷰 모듈)가 호출한다. MPA에선 안 쓰임 ═══ */
window.GALLA_PAGE_INDEX = {
    async mount(root) {
        IDXROOT = root || document;
        // SPA 스크롤 컨테이너(.view-host)에 무한 스크롤 바인딩 — window 스크롤은 안 옴
        if (root && root !== document && !root.__idxInfScroll) {
            root.__idxInfScroll = true;
            root.addEventListener('scroll', () => {
                if (root.scrollTop + root.clientHeight + 400 >= root.scrollHeight) loadRecommend();
            }, { passive: true });
        }
        await initIndexPage();
    },
    unmount() { try { pauseAllVideos(); } catch (_) {} },
    activate() { try { resumeVisibleVideo(); } catch (_) {} },   // 탭 복귀 → 보이는 영상 재개
    deactivate() { try { pauseAllVideos(); } catch (_) {} },     // 탭 이탈 → 영상·소리 정지(기존 shellcmd inactive 로직)
    scrolltop() {
        const el = (IDXROOT && IDXROOT !== document) ? IDXROOT : window;
        try { el.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) { try { el.scrollTo(0, 0); } catch (e2) {} }
    }
};
