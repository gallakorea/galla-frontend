import { loadAiArguments } from "./issue-argument.js";
import { loadAiNews } from "./issue-news.js";
import { loadStats } from "./issue.stats.js";
import { initCommentSystem } from "./issue.comments.js";


console.log("[issue.js] loaded");

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
  const btnPro = qs("btn-vote-pro");
  const btnCon = qs("btn-vote-con");
  if (!btnPro || !btnCon) return;

  if (!stance) {
    btnPro.classList.remove("voted");
    btnCon.classList.remove("voted");
    btnPro.disabled = false;
    btnCon.disabled = false;
    return;
  }

  btnPro.disabled = true;
  btnCon.disabled = true;
  btnPro.classList.add("disabled");
  btnCon.classList.add("disabled");

  if (stance === "pro") btnPro.classList.add("voted");
  if (stance === "con") btnCon.classList.add("voted");
}


/* ==========================================================================
   0-1. GIF
========================================================================== */
async function searchGif(query) {
  const { data, error } = await window.supabaseClient.functions.invoke(
    "gif-search",
    { body: { q: query } }
  );

  if (error) {
    console.error("GIF search error:", error);
    return [];
  }

  return data.results;
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
  loadSupportStats(issue.id);
  loadMySupportStatus(issue.id);
  checkAuthorSupport(issue.id);
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
            <video id="issue-vid" src="${issue.video_url}"
                   ${issue.thumbnail_url ? `poster="${issue.thumbnail_url}"` : ""}
                   loop playsinline webkit-playsinline muted preload="metadata"></video>
            <div class="issue-vid-dur" id="issue-vid-dur">-:--</div>
            <button class="vid-mute" id="issue-vid-mute"
                    onclick="event.stopPropagation();window.GALLA_setSound(!window.GALLA_soundOn())">🔇</button>
            <span class="vid-reels-badge">▶︎ 릴스로 보기</span>
        </div>`;

        const vid = document.getElementById('issue-vid');
        if (vid) {
            vid.addEventListener('loadedmetadata', () => {
                const t = Math.floor(vid.duration);
                const dur = document.getElementById('issue-vid-dur');
                if (dur) dur.textContent = `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;
            });

            // 스크롤 자동재생
            const observer = new IntersectionObserver(entries => {
                entries.forEach(e => {
                    if (e.isIntersecting && e.intersectionRatio > 0.5) {
                        // 전역 사운드 선호 + 제스처 시 소리 재생 (인덱스·릴스와 통일)
                        const wantSound = window.GALLA_soundOn && window.GALLA_soundOn() && window.GALLA_gestured;
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

window.issueToggleMute = function() {
    const v = document.getElementById('issue-vid');
    const btn = document.getElementById('issue-vid-mute');
    if (!v) return;
    v.muted = !v.muted;
    if (btn) btn.textContent = v.muted ? '🔇' : '🔊';
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
    if (v) v.pause();
    if (typeof window.openShorts === 'function') {
        window.openShorts([item], i.id);
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
  const needLogin = () => { if (confirm("로그인이 필요합니다. 로그인할까요?")) location.href = "login.html"; };

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
            icon: "🚀", label: "상단 고정 부스트 (2,000GP · 24h)",
            onClick: async () => {
              if (!confirm("이 갈라를 24시간 피드 상단에 고정할까요? (2,000 GP)")) return;
              const { data } = await supabase.rpc("buy_boost", { p_type: "issue", p_id: Number(issue.id), p_kind: "pin" });
              if (!data?.ok) { alert(data?.reason === "insufficient" ? "GP가 부족해요. (2,000GP 필요)" : "부스트 실패"); return; }
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

  // 진영 버튼 라벨 적용
  const btnPro = qs("btn-vote-pro");
  const btnCon = qs("btn-vote-con");
  if (btnPro && issue.faction_a) btnPro.textContent = `👍 ${issue.faction_a}`;
  if (btnCon && issue.faction_b) btnCon.textContent = `👎 ${issue.faction_b}`;

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

  const authorEl = qs("issue-author");
  authorEl.innerText = "작성자 · " + (issue.author || "익명");

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
async function loadVoteStats(issueId) {
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

  const total = pro + con;
  const proPercent = total ? Math.round((pro / total) * 100) : 0;
  const conPercent = total ? 100 - proPercent : 0;

  qs("vote-pro-bar").style.width = `${proPercent}%`;
  qs("vote-con-bar").style.width = `${conPercent}%`;
  qs("vote-pro-text").innerText = `${proPercent}%`;
  qs("vote-con-text").innerText = `${conPercent}%`;
}

/* ==========================================================================
   4. Vote
========================================================================== */

qs("btn-vote-pro")?.addEventListener("click", async () => {
  if (!issueId) return;
  if (typeof window.GALLA_VOTE !== "function") return;
  if (typeof window.GALLA_CHECK_VOTE !== "function") return;

  await window.GALLA_VOTE(issueId, "pro");

  const voteType = await window.GALLA_CHECK_VOTE(issueId);
  if (voteType === "pro" || voteType === "con") {
    applyVoteUI(voteType);
    document.dispatchEvent(new CustomEvent("galla:voted", { detail: { issueId, faction: voteType } }));
  }

  loadVoteStats(issueId);
  loadStats(issueId);   // 인구통계 인포그래픽도 투표 반영해 갱신
});

qs("btn-vote-con")?.addEventListener("click", async () => {
  if (!issueId) return;
  if (typeof window.GALLA_VOTE !== "function") return;
  if (typeof window.GALLA_CHECK_VOTE !== "function") return;

  await window.GALLA_VOTE(issueId, "con");

  const voteType = await window.GALLA_CHECK_VOTE(issueId);
  if (voteType === "pro" || voteType === "con") {
    applyVoteUI(voteType);
    document.dispatchEvent(new CustomEvent("galla:voted", { detail: { issueId, faction: voteType } }));
  }

  loadVoteStats(issueId);
  loadStats(issueId);   // 인구통계 인포그래픽도 투표 반영해 갱신
});

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

let startX = 0;
document.addEventListener("touchstart", e => (startX = e.touches[0].clientX));
document.addEventListener("touchend", e => {
  if (e.changedTouches[0].clientX - startX > 80) history.back();
});

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
    btn.disabled = true;
    btn.innerText = "🔥 이미 응원했습니다";
  }
}

window.addEventListener("DOMContentLoaded", () => {
  
    /* ==============================
     🎞 GIF 버튼 연동 — 여기
  ============================== */
  document.querySelector(".gif-btn")?.addEventListener("click", async () => {
    const panel = document.getElementById("gif-panel");
    panel.hidden = !panel.hidden;

    if (!panel.hidden) {
      const gifs = await searchGif("battle");
      panel.innerHTML = gifs.map(g =>
        `<img
          src="${g.media_formats.gif.url}"
          class="gif-thumb"
          data-url="${g.media_formats.gif.url}"
        >`
      ).join("");
    }
  });
  
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

// ============================
// GIF 선택 → 입력창 삽입
// ============================

document.addEventListener("click", (e) => {
  const img = e.target.closest(".gif-thumb");
  if (!img) return;

  const url = img.dataset.url;

  const input = document.getElementById("battle-comment-input");
  if (!input) return;

  input.value += ` [gif:${url}] `;

  // 패널 닫기
  document.getElementById("gif-panel").hidden = true;
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