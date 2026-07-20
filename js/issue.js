import { loadAiArguments } from "./issue-argument.js?v=072138";
import { loadAiNews } from "./issue-news.js?v=072138";
import { loadStats } from "./issue.stats.js?v=072138";
import { initCommentSystem } from "./issue.comments.js?v=072138";


console.log("[issue.js] loaded");

/* 직접 등록한 관련 링크·근거 → 카드로 렌더, 클릭 시 외부 이동
   커뮤니티·유튜브·뉴스·자료 등 유형별 아이콘/라벨 */
function relLinkType(url) {
  const h = (() => { try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } })();
  if (/youtube\.com|youtu\.be/.test(h)) return { icon: "▶", label: "유튜브" };
  if (/(dcinside|fmkorea|theqoo|ruliweb|clien|mlbpark|instiz|ppomppu|bobaedream|todayhumor|82cook|pann\.nate|arca\.live|humoruniv|slrclub|inven|gasengi|cook82)/.test(h))
    return { icon: "💬", label: "커뮤니티" };
  if (/(yna\.co|chosun|donga|hani|khan|joongang|hankookilbo|mk\.co|mt\.co|sedaily|newsis|ytn|sbs|kbs|mbc|jtbc|news|press|ilbo|times|herald|edaily|nocutnews|ohmynews|pressian|dt\.co)/.test(h))
    return { icon: "📰", label: "뉴스" };
  if (/(namu\.wiki|wikipedia|blog\.naver|tistory|brunch|medium|gov\.kr|go\.kr|or\.kr|assembly)/.test(h))
    return { icon: "📄", label: "자료" };
  return { icon: "🔗", label: "링크" };
}
function renderRelatedLinks(links) {
  const sec = document.getElementById("related-links-sec");
  const root = document.getElementById("related-links-list");
  if (!sec || !root) return;
  const list = Array.isArray(links) ? links : [];
  if (!list.length) { sec.hidden = true; return; }
  const A = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  root.innerHTML = list.map(l => {
    const url = l && l.url; if (!url || !/^https?:\/\//i.test(url)) return "";
    const t = relLinkType(url);
    return `<a class="rel-news-card" href="${A(url)}" target="_blank" rel="noopener noreferrer">
      ${l.image ? `<span class="rel-news-thumb" style="background-image:url('${A(l.image)}')"></span>` : `<span class="rel-news-thumb none">${t.icon}</span>`}
      <span class="rel-news-mid"><span class="rel-news-src"><span class="rel-news-type">${t.icon} ${t.label}</span> · ${A(l.source || host(url))}</span><span class="rel-news-title">${A(l.title || url)}</span></span>
      <span class="rel-news-go">↗</span>
    </a>`;
  }).join("");
  sec.hidden = false;
}

// 🔥 모바일 세션 지연 대응 (외과적 추가)
async function waitForSessionReady(timeout = 2500) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (!window.supabaseClient) {
      await new Promise(r => setTimeout(r, 50));
      continue;
    }
    const { data } = await window.supabaseClient.auth.getSession();
    if (data?.session) return true;
    await new Promise(r => setTimeout(r, 120));
  }
  return false;
}

/* ==========================================================================
   0. Utils
========================================================================== */
function qs(id) {
  return document.getElementById(id);
}

let issueAuthorId = null;

// ✅ 추가
let currentIssue = null;

// 🔥 모바일/새로고침 대응: 투표 상태 강제 초기 동기화
async function forceInitialVoteSync(issueId) {
  if (!issueId) return;
  if (typeof window.GALLA_CHECK_VOTE !== "function") return;

  // 🔥 핵심: 세션 준비될 때까지 대기 (모바일 필수)
  const ready = await waitForSessionReady();
  if (!ready) return;

  try {
    const result = await window.GALLA_CHECK_VOTE(issueId);
    if (result === "pro" || result === "con") {
      applyVoteUI(result);
    }
    // ⛔ do NOT reset UI on "__NO_VOTE__" or "__SESSION_PENDING__"
  } catch (e) {
    console.warn("[VOTE] initial sync skipped:", e);
  }
}

function applyVoteUI(stance) {
  const gv = qs("issue-gv");
  if (gv && window.GALLA_VoteBar) window.GALLA_VoteBar.setMine(gv, stance);
}


/* ==========================================================================
   1. URL → issue id
========================================================================== */
const params = new URLSearchParams(location.search);
const issueId = Number(params.get("id"));

if (!issueId || Number.isNaN(issueId)) {
  alert("잘못된 이슈 접근입니다.");
  location.href = "index.html";
}


/* ==========================================================================
   2. Load Issue
========================================================================== */
(async function loadIssue() {
  if (!window.supabaseClient) return;

  const supabase = window.supabaseClient;

  const { data: issue, error } = await supabase
    .from("issues")
    .select("*")
    .eq("id", issueId)
    .maybeSingle();

  if (error || !issue) {
    alert("이슈를 불러올 수 없습니다.");
    return;
  }

  // 작성자명·아바타 해석: 비익명이면 실제 닉네임(users.nickname 정본)/프로필사진, 익명이면 "익명"
  let __authorName = "익명";
  let __authorAvatar = null;
  if (!issue.is_anonymous && issue.user_id) {
    const { data: prof } = await supabase
      .from("users").select("nickname, avatar_url").eq("id", issue.user_id).maybeSingle();
    __authorName = prof?.nickname || "익명";
    __authorAvatar = prof?.avatar_url || null;
  }
  issue.author = __authorName;
  issue.author_avatar = __authorAvatar;

// 진영 이름은 글쓴이가 정한다(faction_a/b) — 댓글 배틀·채팅 등 전역에서 사용
window.ISSUE_FACTIONS = {
  pro: issue.faction_a || "찬성",
  con: issue.faction_b || "반대"
};

// 전선 게이지가 종료 카운트다운·정산 결과를 그릴 수 있도록 공개
window.GALLA_ISSUE = issue;

renderIssue(issue);

// 🔴 이 이슈에 진행 중인 일기토가 있으면 관전 배너
checkLiveDuel(issue.id);

// 🔥 투표 상태 초기 동기화 (모바일 새로고침 대응)
await forceInitialVoteSync(issue.id);

await initCommentSystem(issue.id);
forceBattleScrollWithRetry();

/* ===============================
  AI ARGUMENT (논점)
=============================== */
if (typeof loadAiArguments === "function") {
  loadAiArguments(issue);
}

/* ===============================
  관련 뉴스 (직접 등록 외부 링크)
=============================== */
renderRelatedLinks(issue.related_links);

/* ===============================
  발의자 후원 (슈퍼챗형)
=============================== */
if (window.GALLA_initDonations) window.GALLA_initDonations(issue);

/* ===============================
  AI NEWS (뉴스)
=============================== */
if (typeof loadAiNews === "function") {
  loadAiNews(issue);
}
/* 🔥 통계 */
  loadStats(issue.id);

  /* ===============================
    REST
  ================================ */
  loadVoteStats(issue.id);
  if (typeof window.GALLA_CHECK_VOTE === "function") {
    const voteType = await window.GALLA_CHECK_VOTE(issue.id);
    if (voteType === "pro" || voteType === "con") {
      applyVoteUI(voteType);
    }
    // ⛔ DO NOT call applyVoteUI(null)
    // vote.core.js owns the non-voted UI state
  }
  // 진영 밀어주기 (faction.js) — GP 소비 액션, 투표 아래
  if (window.GALLA_initFaction) window.GALLA_initFaction(issue);
  // 이 이슈에 걸린 승패 예측 마켓 배너 (이슈↔예측 연계)
  loadIssueMarket(issue.id);
  checkRemixStatus(issue.id);
  loadRemixCounts(issue.id);

})();

/* ==========================================================================
   3. Render Issue
========================================================================== */

/* 캐러셀 상태 */
let issueCarouselIdx = 0;
let issueCarouselTotal = 0;

// 🔴 이 이슈에 걸린 진행 중(live/voting) 일기토 관전 배너
async function checkLiveDuel(issueId) {
  try {
    const supabase = window.supabaseClient;
    const { data } = await supabase.from("duels")
      .select("id,topic,status")
      .eq("issue_id", issueId).in("status", ["live", "voting"])
      .order("live_started_at", { ascending: false }).limit(1).maybeSingle();
    if (!data) return;
    document.getElementById("duel-live-banner")?.remove();
    const a = document.createElement("a");
    a.id = "duel-live-banner";
    a.className = "duel-live-banner";
    a.href = "duel.html?id=" + data.id;
    a.innerHTML = `<span class="dlb-live">🔴 LIVE</span>
      <span class="dlb-txt">지금 일기토 생중계 — “${(data.topic || "").replace(/</g, "&lt;")}”</span>
      <span class="dlb-go">관전 ›</span>`;
    const header = document.querySelector("#app > .header");
    if (header) header.insertAdjacentElement("afterend", a);
    else document.getElementById("app")?.prepend(a);
  } catch (e) { /* 무해 */ }
}

function renderIssueMedia(issue) {
    const wrap = document.getElementById('issue-media-wrap');
    if (!wrap) return;

    // 영상
    if (issue.video_url) {
        wrap.innerHTML = `
        <div class="issue-media issue-media--video" onclick="issueOpenReels()">
            <video id="issue-vid" data-src="${issue.video_url}"
                   ${issue.thumbnail_url ? `poster="${issue.thumbnail_url}"` : ""}
                   loop playsinline webkit-playsinline muted preload="none"></video>
            <div class="issue-vid-dur" id="issue-vid-dur">-:--</div>
            <button class="vid-mute" id="issue-vid-mute"
                    onclick="event.stopPropagation();var _v=document.getElementById('issue-vid');window.GALLA_setSound(_v?_v.muted:!window.GALLA_soundOn())">${window.GALLA_muteIcon ? window.GALLA_muteIcon(!(window.GALLA_soundOn && window.GALLA_soundOn())) : "🔇"}</button>
            <span class="vid-reels-badge">▶︎ 릴스로 보기</span>
        </div>`;

        const vid = document.getElementById('issue-vid');
        if (vid) {
            // 이슈 진입 = 몰입 뷰 → 소리 ON (인스타 로직, 전역 통일). 음소거는 버튼/전역으로.
            if (window.GALLA_enterImmersive) window.GALLA_enterImmersive();
            // HLS(.m3u8) 부착 — iOS 네이티브 / 그 외 hls.js
            if (window.GALLA_attachHls) window.GALLA_attachHls(vid, vid.dataset.src);
            else vid.src = vid.dataset.src;
            // 릴스/인덱스에서 보던 위치 이어보기(?t=초)
            const seekT = parseFloat(new URLSearchParams(location.search).get('t')) || 0;
            if (seekT > 0.3) {
                const applySeek = () => { try { if (vid.duration && seekT < vid.duration - 0.3) vid.currentTime = seekT; } catch (e) {} };
                if (vid.readyState >= 1) applySeek(); else vid.addEventListener('loadedmetadata', applySeek, { once: true });
            }
            vid.addEventListener('loadedmetadata', () => {
                const t = Math.floor(vid.duration);
                const dur = document.getElementById('issue-vid-dur');
                if (dur) dur.textContent = `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;
            });

            // 스크롤 자동재생
            const observer = new IntersectionObserver(entries => {
                entries.forEach(e => {
                    if (e.isIntersecting && e.intersectionRatio > 0.5) {
                        // 전역 사운드 선호면 바로 소리 재생 시도(실패 시 음소거 폴백 → 첫 제스처에 켜짐)
                        const wantSound = window.GALLA_soundOn && window.GALLA_soundOn();
                        vid.muted = !wantSound;
                        vid.play().catch(() => { vid.muted = true; vid.play().catch(() => {}); });
                        window.GALLA_syncSoundBtns && window.GALLA_syncSoundBtns();
                        document.getElementById('issue-play-ov')?.classList.add('hidden');
                    } else {
                        vid.pause();
                        document.getElementById('issue-play-ov')?.classList.remove('hidden');
                    }
                });
            }, { threshold: 0.5 });
            observer.observe(vid);
            document.addEventListener('galla:sound', () => window.GALLA_syncSoundBtns && window.GALLA_syncSoundBtns());
        }
        return;
    }

    // 사진 (thumbnail_url 단일 or 배열)
    const images = issue.images || (issue.thumbnail_url ? [issue.thumbnail_url] : []);
    if (images.length > 0) {
        issueCarouselTotal = images.length;
        issueCarouselIdx = 0;
        const dots = images.map((_, i) => `<div class="issue-c-dot ${i===0?'on':''}"></div>`).join('');
        const slides = images.map(url => `<div class="issue-slide"><img src="${url}" loading="eager" decoding="async"></div>`).join('');
        wrap.innerHTML = `
        <div class="issue-media">
            <div class="issue-carousel">
                <div class="issue-slides" id="issue-slides">${slides}</div>
                ${images.length > 1 ? `
                <button class="issue-arr l" onclick="issueCarouselGo(-1)">‹</button>
                <button class="issue-arr r" onclick="issueCarouselGo(1)">›</button>
                <div class="issue-c-cnt" id="issue-c-cnt">1 / ${images.length}</div>
                <div class="issue-c-dots" id="issue-c-dots">${dots}</div>
                ` : ''}
            </div>
        </div>`;

        // 터치 스와이프 — 손가락 추적 라이브 드래그(인스타 스타일)
        if (images.length > 1) {
            const carousel = wrap.querySelector('.issue-carousel');
            const slidesEl = carousel.querySelector('.issue-slides');
            let startX = 0, startY = 0, W = 0, dragging = false, decided = false, horiz = false;

            carousel.addEventListener('touchstart', e => {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                W = carousel.offsetWidth;
                dragging = true; decided = false; horiz = false;
                slidesEl.style.transition = 'none';
            }, { passive: true });

            carousel.addEventListener('touchmove', e => {
                if (!dragging) return;
                const dx = e.touches[0].clientX - startX;
                const dy = e.touches[0].clientY - startY;
                if (!decided) {
                    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
                    decided = true;
                    horiz = Math.abs(dx) > Math.abs(dy);
                }
                if (!horiz) return;
                let d = dx;
                if ((issueCarouselIdx === 0 && dx > 0) ||
                    (issueCarouselIdx === issueCarouselTotal - 1 && dx < 0)) d = dx * 0.35;
                slidesEl.style.transform = `translateX(${-issueCarouselIdx * W + d}px)`;
            }, { passive: true });

            carousel.addEventListener('touchend', e => {
                if (!dragging) return;
                dragging = false;
                if (!horiz) return;
                const dx = e.changedTouches[0].clientX - startX;
                const THRESH = Math.min(60, W * 0.2);
                if (dx <= -THRESH) issueCarouselGo(1);
                else if (dx >= THRESH) issueCarouselGo(-1);
                else issueCarouselGo(0);
            }, { passive: true });
        }

        // 슬라이드 폭 px 고정 (모바일 flex-basis:100% 순환 참조 방지)
        sizeIssueCarousel();
        requestAnimationFrame(sizeIssueCarousel);
        if (!window.__issueCarouselResizeBound) {
            window.__issueCarouselResizeBound = true;
            window.addEventListener('resize', sizeIssueCarousel);
        }
        return;
    }

    // 없음
    wrap.innerHTML = '';
}

window.issueTogglePlay = function() {
    const v = document.getElementById('issue-vid');
    const o = document.getElementById('issue-play-ov');
    if (!v) return;
    if (v.paused) { v.play().catch(()=>{}); o?.classList.add('hidden'); }
    else { v.pause(); o?.classList.remove('hidden'); }
};

/* 이슈 승패 예측 배너 — 이 이슈에 연계된 미정산 마켓이 있으면 진영바 아래에 노출 */
async function loadIssueMarket(issueId) {
  try {
    const supabase = window.supabaseClient;
    const { data: m } = await supabase.from('markets')
      .select('id,question,total_pool,jackpot_bonus,close_at,resolved')
      .eq('issue_id', issueId).eq('resolved', false)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!m) return;
    const anchor = document.getElementById('faction-section');
    if (!anchor) return;
    const prize = Math.round((m.total_pool || 0) + (m.jackpot_bonus || 0)).toLocaleString('ko-KR');
    const el = document.createElement('a');
    el.className = 'issue-predict-banner';
    el.href = `predict-market.html?id=${m.id}`;
    el.innerHTML = `
      <span class="ipb-ic">🎯</span>
      <span class="ipb-m">
        <span class="ipb-t">이 이슈의 승패를 예측하세요</span>
        <span class="ipb-s">상금풀 <b>${prize}GP</b> · 적중 시 풀 분배 + 연승 콤보</span>
      </span>
      <span class="ipb-go">참여 ›</span>`;
    anchor.after(el);
  } catch (e) { console.warn('[issue-market]', e); }
}

window.issueToggleMute = function() {
    const v = document.getElementById('issue-vid');
    if (!v) return;
    // 전역 선호를 뒤집어 인덱스·릴스와 통일(현재 재생 영상의 실제 음소거 기준)
    window.GALLA_setSound(v.muted);
};

/* 이슈 인라인 영상 탭 → 전체화면 릴스 모드 */
window.issueOpenReels = function() {
    const i = currentIssue;
    if (!i || !i.video_url) return;
    const item = {
        id: i.id, video_url: i.video_url, title: i.title || "",
        author: i.author || "익명", level: i.level != null ? i.level : "",
        avatar_url: i.author_avatar || null,
        category: i.category || "", user_id: i.user_id || "",
        faction_a: i.faction_a || "", faction_b: i.faction_b || ""
    };
    const v = document.getElementById('issue-vid');
    const startTime = v && !isNaN(v.currentTime) ? v.currentTime : 0;   // 보던 위치 이어보기
    if (v) v.pause();
    if (typeof window.openShorts === 'function') {
        window.openShorts([item], i.id, startTime);
    }
};

function sizeIssueCarousel() {
    const carousel = document.querySelector('.issue-carousel');
    const slides = document.getElementById('issue-slides');
    if (!carousel || !slides) return;
    const w = carousel.clientWidth;
    if (!w) return;
    slides.querySelectorAll('.issue-slide').forEach(s => {
        s.style.flex = `0 0 ${w}px`;
        s.style.width = `${w}px`;
        s.style.maxWidth = `${w}px`;
    });
    slides.style.transition = 'none';
    slides.style.transform = `translateX(${-issueCarouselIdx * w}px)`;
}

window.issueCarouselGo = function(dir) {
    // clamp(끝에서 루프 안 함)
    issueCarouselIdx = Math.max(0, Math.min(issueCarouselTotal - 1, issueCarouselIdx + dir));
    const i = issueCarouselIdx;
    const slides = document.getElementById('issue-slides');
    const cnt = document.getElementById('issue-c-cnt');
    const dots = document.getElementById('issue-c-dots');
    if (slides) {
        const W = slides.parentElement.offsetWidth;  // px 기반 정확 스냅
        slides.style.transition = 'transform .28s ease';
        slides.style.transform = `translateX(${-i * W}px)`;
    }
    if (cnt) cnt.textContent = `${i+1} / ${issueCarouselTotal}`;
    if (dots) dots.querySelectorAll('.issue-c-dot').forEach((d, idx) => {
        d.classList.toggle('on', idx === i);
        d.style.width = idx === i ? '14px' : '5px';
    });
};

async function wireIssueActions(issue) {
  const supabase = window.supabaseClient;
  const likeBtn = document.getElementById("issue-like-btn");
  const likeCount = document.getElementById("issue-like-count");
  const saveBtn = document.getElementById("issue-save-btn");
  const shareBtn = document.getElementById("issue-share-btn");

  if (shareBtn) shareBtn.onclick = () => {
    const url = window.GALLA_shareUrl ? window.GALLA_shareUrl("issue", issue.id) : location.href;
    const title = issue.title ? `⚔️ ${issue.title}` : "GALLA";
    if (window.GALLA_share) window.GALLA_share({ url, title, text: "찬성이냐 반대냐, 당신의 진영은?" });
    else if (navigator.share) navigator.share({ title, url }).catch(() => {});
  };
  if (!supabase) return;

  const { data: sess } = await supabase.auth.getSession();
  const uid = sess?.session?.user?.id || null;
  const needLogin = () => { if (window.GALLA_needLogin) window.GALLA_needLogin("팔로우하려면 로그인이 필요해요."); else if (confirm("로그인이 필요합니다. 로그인할까요?")) location.href = "login.html"; };

  // 좋아요
  let liked = false;
  const { count: c } = await supabase.from("issue_likes").select("user_id", { count: "exact", head: true }).eq("issue_id", issue.id);
  let count = c || 0;
  if (uid) { const { data: m } = await supabase.from("issue_likes").select("issue_id").eq("issue_id", issue.id).eq("user_id", uid).maybeSingle(); liked = !!m; }
  const paintLike = () => { if (likeCount) likeCount.textContent = count; likeBtn?.classList.toggle("on", liked); };
  paintLike();
  if (likeBtn) likeBtn.onclick = async () => {
    if (!uid) return needLogin();
    liked = !liked; count += liked ? 1 : -1; paintLike();
    if (liked) await supabase.from("issue_likes").insert({ issue_id: issue.id, user_id: uid });
    else await supabase.from("issue_likes").delete().eq("issue_id", issue.id).eq("user_id", uid);
  };

  // 저장
  let saved = false;
  if (uid) { const { data: bm } = await supabase.from("bookmarks").select("issue_id").eq("issue_id", issue.id).eq("user_id", uid).maybeSingle(); saved = !!bm; }
  const paintSave = () => saveBtn?.classList.toggle("on", saved);
  paintSave();
  if (saveBtn) saveBtn.onclick = async () => {
    if (!uid) return needLogin();
    saved = !saved; paintSave();
    if (saved) await supabase.from("bookmarks").insert({ issue_id: issue.id, user_id: uid });
    else await supabase.from("bookmarks").delete().eq("issue_id", issue.id).eq("user_id", uid);
  };
}

function renderIssue(issue) {
  currentIssue = issue;
  issueAuthorId = issue.user_id;

  /* 팔로우 버튼: 정적 마크업이라 배선이 없었다(내 글에도 떠 있던 원인).
     공용 모듈(follow.js .js-follow)에 연결 — 상태 페인트·토글·내 글 숨김을 전부 위임 */
  const fb = document.getElementById("follow-btn");
  if (fb) {
    if (issue.user_id && !issue.is_anonymous) {
      fb.classList.add("js-follow");
      fb.dataset.uid = issue.user_id;
      window.GALLA_bindFollow?.();
    } else {
      fb.style.display = "none"; // 익명 발제 등 팔로우 대상 없음
    }
  }

  // 헤더 ⋯ : 소유자·관리자 → 수정/삭제, 아니면 → 신고/차단
  const moreBtn = document.getElementById("header-more-btn");
  if (moreBtn) {
    moreBtn.onclick = async () => {
      const canManage = window.GALLA_canManage ? await window.GALLA_canManage(issue.user_id) : false;
      if (canManage && window.GALLA_openOwnerMenu) {
        window.GALLA_openOwnerMenu({
          table: "issues", id: issue.id, ownerId: issue.user_id, label: "갈라",
          editFields: [
            { key: "title", label: "제목", type: "text", value: issue.title || "" },
            { key: "description", label: "설명", type: "textarea", value: issue.description || "" },
            { key: "category", label: "카테고리", type: "select", options: window.GALLA_CATEGORIES, value: issue.category || "" },
          ],
          extra: [{
            icon: "boost", label: "상단 고정 부스트 (2,000GP · 24h)",
            onClick: async () => {
              if (!confirm("이 갈라를 24시간 피드 상단에 고정할까요? (2,000 GP)")) return;
              const { data } = await supabase.rpc("buy_boost", { p_type: "issue", p_id: Number(issue.id), p_kind: "pin" });
              if (!data?.ok) {
                if (data?.reason === "insufficient" && window.GALLA_needGP) window.GALLA_needGP(2000, "부스트에 GP가 부족해요");
                else alert(data?.reason === "insufficient" ? "GP가 부족해요. (2,000GP 필요)" : "부스트 실패");
                return;
              }
              alert("🚀 상단 고정 완료! 24시간 동안 피드 상단에 노출됩니다.");
            },
          }],
          onSaved: (patch) => {
            if (patch.title != null) { const t = qs("issue-title"); if (t) t.innerText = patch.title; }
            if (patch.category != null) { const c = qs("issue-category"); if (c) c.innerText = patch.category; }
            if (patch.description != null) { const d = qs("issue-desc"); if (d) d.innerText = patch.description; }
          },
          onDeleted: () => { location.href = "index.html"; },
        });
      } else if (window.GALLA_openReportMenu) {
        window.GALLA_openReportMenu({
          contentType: "issue", contentId: issue.id, authorId: issue.user_id, authorName: issue.author,
          onBlocked: () => { location.href = "index.html"; },
        });
      }
    };
  }

  // 액션바: 좋아요 / 저장 / 공유 (실동작)
  wireIssueActions(issue);

  // 미디어 렌더링
  renderIssueMedia(issue);

  // 진영 버튼 라벨 적용(통합 진영바 .gv-name)
  const nameA = qs("btn-vote-pro")?.querySelector(".gv-name");
  const nameB = qs("btn-vote-con")?.querySelector(".gv-name");
  if (nameA && issue.faction_a) nameA.textContent = issue.faction_a;
  if (nameB && issue.faction_b) nameB.textContent = issue.faction_b;

  qs("issue-category").innerText = issue.category || "";
  qs("issue-title").innerText = issue.title || "";
  qs("issue-desc").innerText = issue.one_line || "";

/* 핵심 요약 + Instagram 방식 더 보기 */
const explainWrap = qs("issue-explain-text");

if (explainWrap) {
  const textSpan = explainWrap.querySelector(".ig-text");
  const moreSpan = explainWrap.querySelector(".ig-more");

  if (textSpan) {
    textSpan.textContent = issue.description || "";
  }

  if (textSpan && moreSpan) {
    requestAnimationFrame(() => {
      // 🔥 클론으로 실제 전체 높이 측정
      const clone = textSpan.cloneNode(true);
      clone.style.position = "absolute";
      clone.style.visibility = "hidden";
      clone.style.webkitLineClamp = "unset";
      clone.style.maxHeight = "none";
      clone.style.pointerEvents = "none";

      explainWrap.appendChild(clone);

      const isOverflow =
        clone.scrollHeight > textSpan.clientHeight + 2;

      explainWrap.removeChild(clone);

      if (isOverflow) {
        explainWrap.classList.add("has-more");
      }
    });

    moreSpan.onclick = () => {
      explainWrap.classList.add("expanded");
    };
  }
}

  if (issue.created_at) {
    qs("issue-time").innerText = new Date(issue.created_at).toLocaleDateString();
  }

  // 조회수(유튜브식): 세션당 1회 증가, 즉시 표시
  setViews(issue.view_count || 0);
  bumpViewOnce(issue.id);

  const authorEl = qs("issue-author");
  authorEl.innerText = issue.author || "익명";

  // 작성자 프로필 사진 (없으면 기본 갈라 아이콘) + 클릭 시 마이페이지 이동
  const avEl = document.querySelector(".media-author-head .mah-avatar");
  if (avEl && window.GALLA_avatarImg) {
    avEl.classList.remove("generic");
    avEl.innerHTML = window.GALLA_avatarImg(issue.author_avatar);
  }
  if (!issue.is_anonymous && issue.user_id) {
    if (avEl) avEl.setAttribute("data-profile-uid", issue.user_id);
    if (authorEl) authorEl.setAttribute("data-profile-uid", issue.user_id);
  }
}

/* ==========================================================================
   Vote Stats
========================================================================== */
async function loadVoteStats(issueId, votedSide) {
  const supabase = window.supabaseClient;

  const { data, error } = await supabase
    .from("votes")
    .select("type")
    .eq("issue_id", issueId);

  if (error) {
    console.error("vote stats error", error);
    return;
  }

  let pro = 0;
  let con = 0;

  data.forEach(v => {
    if (v.type === "pro") pro++;
    if (v.type === "con") con++;
  });

  // 통합 진영바로 동적 갱신(바 채움/니들/명수 카운트업/+1 팝/튐)
  const gv = qs("issue-gv");
  if (gv && window.GALLA_VoteBar) {
    window.GALLA_VoteBar.update(gv, { pro, con }, { voted: votedSide || null, animate: true });
  }

  // 전선 게이지(여론 60% + 댓글대전 40%)가 쓸 수 있도록 투표수를 전역 공개
  window.GALLA_ISSUE_VOTES = { pro, con };
  window.dispatchEvent(new CustomEvent("galla:votes", { detail: { pro, con } }));
}

// 숫자 카운트업 애니메이션 (인포그래픽 공용)
function countUpText(el, target, suffix = "") {
  if (!el) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { el.innerText = `${target}${suffix}`; return; }
  const start = parseFloat(el.dataset.cv || "0") || 0;
  const dur = 700, t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
    const val = Math.round(start + (target - start) * e);
    el.innerText = `${val}${suffix}`;
    if (p < 1) requestAnimationFrame(step); else el.dataset.cv = String(target);
  };
  requestAnimationFrame(step);
}
window.GALLA_countUp = countUpText;

// 유튜브식 숫자 축약
function fmtK(n) {
  n = Number(n) || 0;
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0).replace(/\.0$/, "") + "천";
  if (n < 100000000) return (n / 10000).toFixed(n % 10000 >= 1000 ? 1 : 0).replace(/\.0$/, "") + "만";
  return (n / 100000000).toFixed(1).replace(/\.0$/, "") + "억";
}
function setViews(n) { const el = qs("issue-views"); if (el) el.innerText = "조회 " + fmtK(n); }
async function bumpViewOnce(issueId) {
  if (!issueId) return;
  const key = "gv_viewed_" + issueId;
  try { if (sessionStorage.getItem(key)) return; } catch (e) {}
  try {
    const { data } = await window.supabaseClient.rpc("bump_view", { p_issue: issueId });
    if (typeof data === "number") setViews(data);
    try { sessionStorage.setItem(key, "1"); } catch (e) {}
  } catch (e) {}
}

/* ==========================================================================
   4. Vote
========================================================================== */

// 통합 진영바 마운트 + 클릭 위임(재마운트해도 컨테이너 리스너 유지)
(function initIssueVoteBar() {
  const gv = qs("issue-gv");
  if (!gv || !window.GALLA_VoteBar) return;
  window.GALLA_VoteBar.mount(gv, {
    factionA: "찬성이오", factionB: "난 반댈세", pro: 0, con: 0,
    proAttr: 'id="btn-vote-pro"', conAttr: 'id="btn-vote-con"'
  });
  gv.addEventListener("click", async (e) => {
    const b = e.target.closest(".gv-btn"); if (!b) return;
    if (!issueId || typeof window.GALLA_VOTE !== "function" || typeof window.GALLA_CHECK_VOTE !== "function") return;
    const type = b.classList.contains("gv-pro") ? "pro" : "con";
    // 0) 로그인 필수 (미로그인은 이펙트·낙관 반영 전 차단)
    if (!window.GALLA_requireLogin || !(await window.GALLA_requireLogin("진영 선택은 로그인 후 가능해요."))) return;
    // 0-1) 이미 투표했으면 서버 기준 잠금+안내 후 중단(변경 불가)
    if (window.GALLA_VoteBar && await window.GALLA_VoteBar.guardLocked(gv, issueId)) return;
    // 1) 낙관적 즉시 반영(첫 클릭에도 바로 움직임 + 팝/튐)
    if (window.GALLA_VoteBar) window.GALLA_VoteBar.applyVote(gv, type);
    // 2) 실제 투표 + 서버 수치로 조용히 수렴
    await window.GALLA_VOTE(issueId, type);
    const voteType = await window.GALLA_CHECK_VOTE(issueId);
    if (voteType === "pro" || voteType === "con") {
      applyVoteUI(voteType);
      document.dispatchEvent(new CustomEvent("galla:voted", { detail: { issueId, faction: voteType } }));
    }
    loadVoteStats(issueId);   // votedSide 없음 → 팝/튐 중복 없이 실제값 반영
    loadStats(issueId);
  });
})();

/* ==========================================================================
   Support Actions (Pro / Con)
========================================================================== */

async function support(stance, amount) {
  const supabase = window.supabaseClient;
  const { data: session } = await supabase.auth.getSession();

  if (!session.session) {
    alert("로그인이 필요합니다.");
    return;
  }

  const { error } = await supabase.from("supports").insert({
    issue_id: issueId,
    user_id: session.session.user.id,
    stance,
    amount
  });

  if (error) {
    console.error("support error", error);
    alert("후원에 실패했습니다.");
    return;
  }

  loadSupportStats(issueId);
  loadMySupportStatus(issueId);

  alert(
    stance === "pro"
      ? `👍 ${currentIssue?.faction_a || "찬성"} 진영을 지원했습니다.`
      : `👎 ${currentIssue?.faction_b || "반대"} 진영을 지원했습니다.`
  );
}

/* ==========================================================================
   5. Support
========================================================================== */
async function loadSupportStats(issueId) {
  const supabase = window.supabaseClient;
  const { data, error } = await supabase
    .from("supports")
    .select("stance, amount")
    .eq("issue_id", issueId);

  if (error) {
    console.warn("support stats skipped:", error.message);
    return;
  }

  let pro = 0, con = 0;
  data?.forEach(s => {
    if (s.stance === "pro") pro += s.amount;
    if (s.stance === "con") con += s.amount;
  });

  const total = pro + con || 1;
  qs("sup-pro-bar").style.width = `${(pro / total) * 100}%`;
  qs("sup-con-bar").style.width = `${(con / total) * 100}%`;
  qs("sup-pro-amount").innerText = `₩${pro.toLocaleString()}`;
  qs("sup-con-amount").innerText = `₩${con.toLocaleString()}`;
}

async function loadMySupportStatus(issueId) {
  const supabase = window.supabaseClient;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return;

  const { data } = await supabase
    .from("supports")
    .select("stance, amount")
    .eq("issue_id", issueId)
    .eq("user_id", session.session.user.id);

  if (!data || data.length === 0) return;

  const total = data.reduce((s, v) => s + v.amount, 0);
  const stance = data[0].stance;

  qs("support-status-text").innerText =
    `${stance === "pro" ? (currentIssue?.faction_a || "찬성") : (currentIssue?.faction_b || "반대")} 진영에 ₩${total.toLocaleString()} 도움을 주셨습니다.`;
}

/* ==========================================================================
   7. Video Modal — 제거됨 (인라인 재생으로 대체)
========================================================================== */

/* ==========================================================================
   8. Remix
========================================================================== */
async function checkRemixStatus(issueId) {
  const supabase = window.supabaseClient;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return;

  const { data } = await supabase
    .from("remixes")
    .select("remix_stance")
    .eq("issue_id", issueId)
    .eq("user_id", session.session.user.id)
    .maybeSingle();

  if (!data) return;

  applyRemixJoinedUI(data.remix_stance);
}

async function loadRemixCounts(issueId) {
  const supabase = window.supabaseClient;
  const { data, error } = await supabase
    .from("remixes")
    .select("remix_stance")
    .eq("issue_id", issueId);

  if (error) {
    console.warn("remix count skipped:", error.message);
    return;
  }

  const pro = data?.filter(r => r.remix_stance === "pro").length || 0;
  const con = data?.filter(r => r.remix_stance === "con").length || 0;

  const proEl = document.getElementById("remix-pro-count");
  const conEl = document.getElementById("remix-con-count");

  if (!proEl || !conEl) return;

  proEl.innerText = `참전 ${pro} · 리믹스 ${pro}`;
  conEl.innerText = `참전 ${con} · 리믹스 ${con}`;
}

function applyRemixJoinedUI(stance) {
  qs("btn-remix-pro").disabled = true;
  qs("btn-remix-con").disabled = true;
}

qs("btn-remix-pro")?.addEventListener("click", () => goRemix("pro"));
qs("btn-remix-con")?.addEventListener("click", () => goRemix("con"));

function goRemix(stance) {
  if (!currentIssue) {
    alert("이슈 정보를 불러오지 못했습니다.");
    return;
  }

  sessionStorage.setItem(
    "remixContext",
    JSON.stringify({
      origin_issue_id: currentIssue.id,
      remix_stance: stance,
      category: currentIssue.category
    })
  );

  location.href = "write-remix.html";
}

/* ==========================================================================
   9. Back + Swipe
========================================================================== */
qs("btn-back")?.addEventListener("click", () => history.back());
// 좌→우 스와이프 뒤로가기는 nav.js가 전 페이지 공통으로 처리(비-탭 페이지). 중복 제거.

/* ==========================================================================
   10. Author Support
========================================================================== */
async function checkAuthorSupport(issueId) {
  const supabase = window.supabaseClient;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session || !issueAuthorId) return;

  const { data } = await supabase
    .from("author_supports")
    .select("id")
    .eq("issue_id", issueId)
    .eq("author_id", issueAuthorId)
    .eq("user_id", session.session.user.id)
    .maybeSingle();

  if (data) {
    const btn = qs("author-support-btn");
    if (!btn) return; // 후원(donate) 섹션으로 교체됨 — 구 버튼 없으면 무시
    btn.disabled = true;
    btn.innerText = "🔥 이미 응원했습니다";
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const supportModal = document.getElementById("support-modal");
  if (!supportModal) return;

  /* 열기 */
  document.getElementById("support-pro-btn")?.addEventListener("click", () => {
    supportModal.removeAttribute("hidden");
  });

  document.getElementById("support-con-btn")?.addEventListener("click", () => {
    supportModal.removeAttribute("hidden");
  });

  /* 닫기 */
  supportModal.addEventListener("click", (e) => {
    if (e.target === supportModal || e.target.hasAttribute("data-close")) {
      supportModal.setAttribute("hidden", "");
    }
  });

  // 보탬 레벨 선택
  document.querySelectorAll(".support-level").forEach(level => {
    level.addEventListener("click", () => {
      document.querySelectorAll(".support-level.active")
        .forEach(el => el.classList.remove("active"));

      level.classList.add("active");

      const confirmBtn = document.querySelector(".support-confirm");
      if (confirmBtn) confirmBtn.disabled = false;
    });
  });
});

// ================================
// HASH SCROLL FIX (Index → Issue)
// ================================

function forceBattleScroll() {
  if (location.hash !== "#battle-zone") return;

  const el = document.getElementById("battle-zone");
  if (!el) return;

  const y = el.getBoundingClientRect().top + window.pageYOffset - 12;
  window.scrollTo({ top: y, behavior: "smooth" });
}

function forceBattleScrollWithRetry() {
  if (location.hash !== "#battle-zone") return;

  let tries = 0;
  const timer = setInterval(() => {
    tries++;

    const el = document.getElementById("battle-zone");
    if (el) {
      clearInterval(timer);
      setTimeout(forceBattleScroll, 120);
    }

    if (tries > 25) clearInterval(timer);
  }, 100);
}