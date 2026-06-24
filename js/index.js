/********************************************
 *  INDEX.JS — GALLA v2 (세로형 + 커스텀 진영)
 ********************************************/

let cards = [];
window.cards = cards;
let bestList, recommendList, bestMore;

/* ===========================
 * 비디오 자동재생 옵저버
 * =========================== */
const videoObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
        const vid = e.target;
        const ovId = vid.dataset.overlayId;
        const ov = ovId ? document.getElementById(ovId) : null;
        if (e.isIntersecting && e.intersectionRatio > 0.5) {
            vid.play().catch(() => {});
            if (ov) ov.classList.add('hidden');
        } else {
            vid.pause();
            if (ov) ov.classList.remove('hidden');
        }
    });
}, { threshold: 0.5 });

/* ===========================
 * 캐러셀 상태
 * =========================== */
const carouselState = {};

function carouselGo(issueId, dir) {
    const state = carouselState[issueId];
    if (!state) return;
    state.idx = (state.idx + dir + state.total) % state.total;
    const i = state.idx;
    const slides = document.getElementById(`slides-${issueId}`);
    const dots = document.getElementById(`dots-${issueId}`);
    const cnt = document.getElementById(`cnt-${issueId}`);
    if (slides) slides.style.transform = `translateX(-${i * 100}%)`;
    if (cnt) cnt.textContent = `${i + 1} / ${state.total}`;
    if (dots) {
        dots.querySelectorAll('.carousel-dot').forEach((d, idx) => {
            d.classList.toggle('on', idx === i);
            d.style.width = idx === i ? '14px' : '5px';
        });
    }
}

/* ===========================
 * 미디어 렌더러
 * =========================== */
function renderMedia(data) {
    // 영상
    if (data.video_url) {
        const ovId = `ov-${data.id}`;
        return `
        <div class="card-media" onclick="event.stopPropagation()">
            <video
                id="vid-${data.id}"
                data-overlay-id="${ovId}"
                loop playsinline muted preload="metadata"
                onclick="toggleVidPlay('vid-${data.id}','${ovId}')">
                <source src="${data.video_url}" type="video/mp4">
            </video>
            <div class="play-overlay" id="${ovId}">
                <div class="play-circle"><div class="play-tri"></div></div>
            </div>
            <div class="vid-dur" id="dur-${data.id}">-:--</div>
            <button class="vid-mute" id="mute-${data.id}"
                onclick="event.stopPropagation();toggleMute('vid-${data.id}','mute-${data.id}')">🔇</button>
        </div>`;
    }

    // 사진 캐러셀
    if (data.images && data.images.length > 0) {
        const imgs = data.images;
        const total = imgs.length;
        carouselState[data.id] = { idx: 0, total };
        const dotsHtml = imgs.map((_, i) =>
            `<div class="carousel-dot ${i === 0 ? 'on' : ''}"></div>`).join('');
        const slidesHtml = imgs.map(url =>
            `<div class="carousel-slide"><img src="${url}" loading="lazy"></div>`).join('');
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

    return `
    <div class="card" data-id="${data.id}" data-link="issue.html?id=${data.id}">

        ${renderMedia(data)}

        <div class="card-body">
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
                    <img src="assets/icons/icon-bookmark.svg" class="open-modal" data-msg="북마크 준비 중">
                    <img src="assets/icons/icon-share.svg" class="open-modal" data-msg="공유 준비 중">
                </div>
                <button class="more-btn open-modal" data-msg="더보기 메뉴 준비 중">${moreIcon}</button>
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

    // 전황표 → 이슈 댓글
    document.querySelectorAll('.goto-comments').forEach(el => {
        el.onclick = e => {
            e.stopPropagation();
            const card = el.closest('.card');
            location.href = `issue.html?id=${card.dataset.id}#battle-zone`;
        };
    });

    // 카드 전체 클릭
    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', e => {
            const url = card.dataset.link;
            if (url) location.href = url;
        });
    });

    // 비디오 자동재생 옵저버 등록
    document.querySelectorAll('.card-media video').forEach(v => {
        videoObserver.observe(v);
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
    await loadData();
});

// 스크롤 복원/저장
if (localStorage.getItem('scrollPos')) {
    window.scrollTo(0, Number(localStorage.getItem('scrollPos')));
}
window.addEventListener('scroll', () => {
    localStorage.setItem('scrollPos', window.scrollY);
});

async function loadData() {
    const supabase = window.supabaseClient;

    const { data: issues, error } = await supabase
        .from('issues')
        .select(`
            id, title, one_line, category, created_at,
            pro_count, con_count, sup_pro, sup_con,
            user_id, thumbnail_url, video_url,
            faction_a, faction_b
        `)
        .order('created_at', { ascending: false });

    if (error) { console.error(error); return; }

    const userIds = [...new Set(issues.map(i => i.user_id).filter(Boolean))];
    const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, nickname, level')
        .in('user_id', userIds);

    const profileMap = {};
    profiles?.forEach(p => profileMap[p.user_id] = p);

    cards = issues.map(row => ({
        id: row.id,
        category: row.category,
        author: profileMap[row.user_id]?.nickname || '익명',
        level: profileMap[row.user_id]?.level || 1,
        time: new Date(row.created_at).toLocaleDateString(),
        title: row.title,
        oneLine: row.one_line,
        pro: row.pro_count || 0,
        con: row.con_count || 0,
        thumb: row.thumbnail_url,
        video_url: row.video_url,
        faction_a: row.faction_a,
        faction_b: row.faction_b,
        images: row.thumbnail_url ? [row.thumbnail_url] : []
    }));

    const issueIds = cards.map(c => c.id);
    const warMap = await loadWarData(issueIds);
    cards = cards.map(c => ({ ...c, war: warMap[c.id] }));
    window.cards = cards;

    loadBest();
    loadRecommend();
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
