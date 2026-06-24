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

renderIssue(issue);

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

function renderIssueMedia(issue) {
    const wrap = document.getElementById('issue-media-wrap');
    if (!wrap) return;

    // 영상
    if (issue.video_url) {
        wrap.innerHTML = `
        <div class="issue-media" onclick="issueTogglePlay()">
            <video id="issue-vid" loop playsinline muted preload="metadata">
                <source src="${issue.video_url}" type="video/mp4">
            </video>
            <div class="issue-play-overlay" id="issue-play-ov">
                <div class="issue-play-circle"><div class="issue-play-tri"></div></div>
            </div>
            <div class="issue-vid-dur" id="issue-vid-dur">-:--</div>
            <button class="issue-vid-mute" id="issue-vid-mute"
                onclick="event.stopPropagation();issueToggleMute()">🔇</button>
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
                        vid.play().catch(() => {});
                        document.getElementById('issue-play-ov')?.classList.add('hidden');
                    } else {
                        vid.pause();
                        document.getElementById('issue-play-ov')?.classList.remove('hidden');
                    }
                });
            }, { threshold: 0.5 });
            observer.observe(vid);
        }
        return;
    }

    // 사진 (thumbnail_url 단일 or 배열)
    const images = issue.images || (issue.thumbnail_url ? [issue.thumbnail_url] : []);
    if (images.length > 0) {
        issueCarouselTotal = images.length;
        issueCarouselIdx = 0;
        const dots = images.map((_, i) => `<div class="issue-c-dot ${i===0?'on':''}"></div>`).join('');
        const slides = images.map(url => `<div class="issue-slide"><img src="${url}" loading="lazy"></div>`).join('');
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

window.issueCarouselGo = function(dir) {
    issueCarouselIdx = (issueCarouselIdx + dir + issueCarouselTotal) % issueCarouselTotal;
    const i = issueCarouselIdx;
    const slides = document.getElementById('issue-slides');
    const cnt = document.getElementById('issue-c-cnt');
    const dots = document.getElementById('issue-c-dots');
    if (slides) slides.style.transform = `translateX(-${i*100}%)`;
    if (cnt) cnt.textContent = `${i+1} / ${issueCarouselTotal}`;
    if (dots) dots.querySelectorAll('.issue-c-dot').forEach((d, idx) => {
        d.classList.toggle('on', idx === i);
        d.style.width = idx === i ? '14px' : '5px';
    });
};

function renderIssue(issue) {
  currentIssue = issue;
  issueAuthorId = issue.user_id;

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

  qs("issue-author").innerText = "작성자 · 익명";
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
  }

  loadVoteStats(issueId);
});

qs("btn-vote-con")?.addEventListener("click", async () => {
  if (!issueId) return;
  if (typeof window.GALLA_VOTE !== "function") return;
  if (typeof window.GALLA_CHECK_VOTE !== "function") return;

  await window.GALLA_VOTE(issueId, "con");

  const voteType = await window.GALLA_CHECK_VOTE(issueId);
  if (voteType === "pro" || voteType === "con") {
    applyVoteUI(voteType);
  }

  loadVoteStats(issueId);
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
      ? "👍 찬성 진영을 지원했습니다."
      : "👎 반대 진영을 지원했습니다."
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
    `${stance === "pro" ? "찬성" : "반대"} 진영에 ₩${total.toLocaleString()} 도움을 주셨습니다.`;
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