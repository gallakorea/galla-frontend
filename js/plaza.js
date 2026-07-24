/* =========================
   SUPABASE CLIENT INIT
========================= */
// 로컬 vendor UMD 전역 사용 (esm.sh 16모듈 폭포수 로드 제거)
const { createClient } = window.supabase;

const SUPABASE_URL = "https://bidqauputnhkqepvdzrr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// write-hub / dm 공용 클라이언트로 노출
window.supabaseClient = window.supabaseClient || supabase;
/* =========================
   LIST STATE
========================= */

const plazaListEl = document.querySelector(".plaza-list");
let currentCategory = "전체";

/* =========================
   MODAL OPEN / CLOSE
========================= */

const modal = document.getElementById("plaza-write-modal");

/* 정통망법 대비: 글 작성은 무조건 로그인(작성자 기록). 익명은 '표시'만 가능 */
async function requirePlazaLogin() {
  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user || null;
  if (user) return user;
  if (confirm("글을 쓰려면 로그인이 필요합니다. 로그인하시겠어요?")) {
    location.href = "login.html";
  }
  return null;
}

// 공용 임시저장 — 광장 글(제목·본문·카테고리)
const __plazaDraft = window.GALLA_draft &&
  window.GALLA_draft('plaza', ['plaza-title', 'plaza-body', 'plaza-category']);
async function openPlazaWriteModal() {
  const user = await requirePlazaLogin();
  if (!user) return;
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  if (__plazaDraft) __plazaDraft.restore();   // 이어쓰기 복원
}
// expose for inline HTML handlers
window.openPlazaWriteModal = openPlazaWriteModal;
// 통합 글쓰기 허브('광장' 선택) / ?compose=1 진입 시 모달 오픈
window.__openComposeModal = openPlazaWriteModal;
if (new URLSearchParams(location.search).get("compose") === "1") {
  setTimeout(openPlazaWriteModal, 60);
}
// 헤더 DM 버튼 초기화
if (window.initNotifications) window.initNotifications();   // 헤더 DM은 알림으로 교체(네비에 DM 탭)

function closePlazaWriteModal() {
  modal.classList.add("hidden");
  document.body.style.overflow = "";
  // 미리보기 화면이 열려 있으면 편집 화면으로 복귀
  if (typeof previewOn !== "undefined" && previewOn) {
    previewOn = false;
    const pv = document.getElementById("plaza-preview");
    const btn = document.getElementById("tb-preview");
    const body = document.getElementById("plaza-body");
    if (pv) pv.hidden = true;
    if (body) body.style.display = "";
    if (btn) btn.classList.remove("on");
  }
}
// expose for inline HTML handlers
window.closePlazaWriteModal = closePlazaWriteModal;

/* =========================
   FORM ELEMENTS
========================= */

const categorySelect = document.getElementById("plaza-category");

/* =========================
   CATEGORY FILTER
========================= */

document.querySelectorAll(".plaza-categories button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".plaza-categories button")
      .forEach(b => b.classList.remove("active"));

    btn.classList.add("active");
    currentCategory = btn.textContent.trim();
    fetchPlazaPosts();
  });
});

const titleInput = document.getElementById("plaza-title");
const submitBtn = document.getElementById("plaza-submit");
const charCount = document.getElementById("char-count");
const bodyInput = document.getElementById("plaza-body");

const attachStrip = document.getElementById("plaza-attach");
const previewEl = document.getElementById("plaza-preview");
const dropHint = document.getElementById("plaza-drophint");
const editorBody = document.getElementById("editorBody");

const IMG_MAX = 20 * 1024 * 1024; // 20MB
const VID_MAX = 50 * 1024 * 1024; // 50MB

let uploading = 0;
let previewOn = false;

/* =========================
   공통: 본문 변경 반영
========================= */
function onBodyChanged() {
  if (charCount) charCount.textContent = bodyInput.value.length;
  refreshAttach();
  validatePlazaForm();
  if (previewOn) renderPreview();
}

bodyInput?.addEventListener("input", onBodyChanged);
titleInput?.addEventListener("input", validatePlazaForm);
categorySelect?.addEventListener("change", validatePlazaForm);

/* =========================
   VALIDATION
   - 카테고리/제목 필수, 본문(글 또는 미디어) 필수, 업로드 중이면 비활성
========================= */
function validatePlazaForm() {
  const hasCategory = categorySelect.value.trim() !== "";
  const hasTitle = titleInput.value.trim().length > 0;
  const hasBody = bodyInput.value.trim().length > 0;
  submitBtn.disabled = uploading > 0 || !(hasCategory && hasTitle && hasBody);
}

/* =========================
   에디터: 텍스트 조작 유틸
========================= */
function wrapSel(before, after) {
  const s = bodyInput.selectionStart, e = bodyInput.selectionEnd;
  const v = bodyInput.value;
  const sel = v.slice(s, e) || "텍스트";
  bodyInput.value = v.slice(0, s) + before + sel + after + v.slice(e);
  bodyInput.selectionStart = s + before.length;
  bodyInput.selectionEnd = s + before.length + sel.length;
  bodyInput.focus();
  onBodyChanged();
}

function linePrefix(pfx) {
  const s = bodyInput.selectionStart;
  const v = bodyInput.value;
  const lineStart = v.lastIndexOf("\n", s - 1) + 1;
  bodyInput.value = v.slice(0, lineStart) + pfx + v.slice(lineStart);
  bodyInput.selectionStart = bodyInput.selectionEnd = s + pfx.length;
  bodyInput.focus();
  onBodyChanged();
}

function insertLink() {
  const url = prompt("링크 URL을 입력하세요 (https://...)");
  if (!url) return;
  const u = url.trim();
  if (!/^https?:\/\//i.test(u)) return alert("http(s):// 로 시작하는 URL만 가능해요.");
  const s = bodyInput.selectionStart, e = bodyInput.selectionEnd;
  const v = bodyInput.value;
  const text = v.slice(s, e) || u;
  const md = `[${text}](${u})`;
  bodyInput.value = v.slice(0, s) + md + v.slice(e);
  bodyInput.selectionStart = bodyInput.selectionEnd = s + md.length;
  bodyInput.focus();
  onBodyChanged();
}

// 블록 마커([IMAGE]/[VIDEO]/[EMBED])를 한 줄 단독으로 삽입
function insertBlock(marker) {
  const v = bodyInput.value;
  const start = bodyInput.selectionStart;
  const prefix = v.slice(0, start);
  const suffix = v.slice(start);
  const pre = prefix.length && !prefix.endsWith("\n") ? "\n" : "";
  const post = suffix.startsWith("\n") ? "" : "\n";
  const chunk = pre + marker + post;
  bodyInput.value = prefix + chunk + suffix;
  const pos = (prefix + chunk).length;
  bodyInput.selectionStart = bodyInput.selectionEnd = pos;
  bodyInput.focus();
  onBodyChanged();
}

/* =========================
   툴바 버튼
========================= */
document.getElementById("plaza-toolbar")?.addEventListener("click", (e) => {
  const b = e.target.closest(".tb-btn[data-fmt]");
  if (!b) return;
  const fmt = b.dataset.fmt;
  if (fmt === "bold") wrapSel("**", "**");
  else if (fmt === "italic") wrapSel("*", "*");
  else if (fmt === "strike") wrapSel("~~", "~~");
  else if (fmt === "quote") linePrefix("> ");
  else if (fmt === "list") linePrefix("- ");
  else if (fmt === "link") insertLink();
});

document.getElementById("tb-extimg")?.addEventListener("click", () => {
  const url = prompt("이미지 주소(URL)를 붙여넣으세요");
  if (!url) return;
  const u = url.trim();
  if (!/^https?:\/\//i.test(u)) return alert("http(s):// 이미지 URL만 가능해요.");
  insertBlock(`[IMAGE]${u}`);
});

document.getElementById("tb-embed")?.addEventListener("click", () => {
  const url = prompt("유튜브/비메오 또는 링크 URL을 붙여넣으세요");
  if (!url) return;
  const u = url.trim();
  if (!/^https?:\/\//i.test(u)) return alert("http(s):// URL만 가능해요.");
  insertBlock(`[EMBED]${u}`);
});

/* =========================
   미리보기 토글
========================= */
function renderPreview() {
  const html = window.GALLA_renderPlazaBody
    ? window.GALLA_renderPlazaBody(bodyInput.value)
    : "";
  previewEl.innerHTML = html || `<p class="pb-empty">미리볼 내용이 없어요.</p>`;
}
document.getElementById("tb-preview")?.addEventListener("click", (e) => {
  previewOn = !previewOn;
  const btn = e.currentTarget;
  if (previewOn) {
    renderPreview();
    previewEl.hidden = false;
    bodyInput.style.display = "none";
    btn.classList.add("on");
  } else {
    previewEl.hidden = true;
    bodyInput.style.display = "";
    btn.classList.remove("on");
    bodyInput.focus();
  }
});

/* =========================
   파일 업로드 (사진/동영상 → plaza-images 버킷, 익명 anon)
========================= */
const imageInput = document.createElement("input");
imageInput.type = "file";
imageInput.accept = "image/*";
imageInput.multiple = true;
imageInput.style.display = "none";
document.body.appendChild(imageInput);

const videoInput = document.createElement("input");
videoInput.type = "file";
videoInput.accept = "video/*";
videoInput.style.display = "none";
document.body.appendChild(videoInput);

document.getElementById("tb-photo")?.addEventListener("click", () => imageInput.click());
document.getElementById("tb-video")?.addEventListener("click", () => videoInput.click());

imageInput.addEventListener("change", () => {
  if (imageInput.files.length) handleFiles([...imageInput.files]);
  imageInput.value = "";
});
videoInput.addEventListener("change", () => {
  if (videoInput.files.length) handleFiles([...videoInput.files]);
  videoInput.value = "";
});

async function uploadToBucket(file) {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const name = `plaza_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await supabase.storage
    .from("plaza-images")
    .upload(name, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  return supabase.storage.from("plaza-images").getPublicUrl(name).data.publicUrl;
}

async function handleFiles(files) {
  for (const f of files) {
    const isVid = /^video\//.test(f.type);
    const isImg = /^image\//.test(f.type);
    if (!isVid && !isImg) { alert("이미지 또는 동영상만 올릴 수 있어요."); continue; }
    if (isImg && f.size > IMG_MAX) { alert("이미지는 20MB 이하만 가능해요."); continue; }
    if (isVid && f.size > VID_MAX) { alert("동영상은 50MB 이하만 가능해요."); continue; }

    uploading++;
    refreshAttach();
    validatePlazaForm();
    try {
      const url = await uploadToBucket(f);
      insertBlock(`[${isVid ? "VIDEO" : "IMAGE"}]${url}`);
    } catch (err) {
      console.error("plaza upload error:", err);
      alert("업로드 실패: " + (err?.message || err));
    } finally {
      uploading--;
      refreshAttach();
      validatePlazaForm();
    }
  }
}

/* =========================
   드래그&드롭 / 붙여넣기 업로드
========================= */
["dragenter", "dragover"].forEach((ev) =>
  editorBody?.addEventListener(ev, (e) => {
    if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) {
      e.preventDefault();
      if (dropHint) dropHint.hidden = false;
    }
  })
);
["dragleave", "drop"].forEach((ev) =>
  editorBody?.addEventListener(ev, (e) => {
    if (ev === "drop") {
      e.preventDefault();
      const files = [...(e.dataTransfer?.files || [])];
      if (files.length) handleFiles(files);
    }
    if (dropHint) dropHint.hidden = true;
  })
);
bodyInput?.addEventListener("paste", (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) { e.preventDefault(); handleFiles(files); }
});

/* =========================
   첨부 미리보기 스트립 (본문 마커에서 파생)
========================= */
function refreshAttach() {
  if (!attachStrip) return;
  const items = [];
  const re = /\[(IMAGE|VIDEO)\](https?:\/\/[^\s]+)/g;
  let m;
  while ((m = re.exec(bodyInput.value))) items.push({ kind: m[1], url: m[2], marker: m[0] });

  if (!items.length && uploading === 0) {
    attachStrip.hidden = true;
    attachStrip.innerHTML = "";
    return;
  }
  attachStrip.hidden = false;
  attachStrip.innerHTML =
    items.map((it) =>
      `<div class="pa-item">
        ${it.kind === "IMAGE"
          ? `<img src="${it.url}">`
          : `<video src="${it.url}" muted preload="metadata"></video><span class="pa-badge">▶</span>`}
        <button type="button" class="pa-del" data-marker="${encodeURIComponent(it.marker)}">✕</button>
      </div>`
    ).join("") +
    (uploading > 0 ? `<div class="pa-item pa-uploading"><div class="pa-spin"></div></div>` : "");
}

attachStrip?.addEventListener("click", (e) => {
  const del = e.target.closest(".pa-del");
  if (!del) return;
  const marker = decodeURIComponent(del.dataset.marker);
  // 마커 라인 제거 (앞뒤 줄바꿈 정리)
  const v = bodyInput.value;
  const idx = v.indexOf(marker);
  if (idx === -1) return;
  let start = idx, end = idx + marker.length;
  if (v[end] === "\n") end++;
  else if (v[start - 1] === "\n") start--;
  bodyInput.value = v.slice(0, start) + v.slice(end);
  onBodyChanged();
});

/* =========================
   익명 닉네임 생성
========================= */

function generateAnonNickname() {
  const adjectives = [
    "웃픈", "화난", "졸린", "배고픈",
    "과몰입한", "이상한", "솔직한", "무서운"
  ];
  const nouns = [
    "감자", "고양이", "직장인", "유령",
    "돌고래", "오징어", "사람", "외계인"
  ];

  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 1000);

  return `${adj} ${noun} ${num}`;
}

/* =========================
   FETCH + RENDER POSTS
========================= */

function extractFirstImage(body) {
  if (!body) return null;
  const match = body.match(/\[IMAGE\](https?:\/\/[^\s]+)/);
  return match ? match[1] : null;
}

// 본문에서 텍스트만 뽑아 카드 미리보기용 요약
function plazaExcerpt(body) {
  if (!body) return "";
  return String(body)
    .replace(/^\[(IMAGE|VIDEO|EMBED)\].*$/gim, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_~`]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, 72);
}
function escP(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function timeAgoK(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "방금 전";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

async function fetchPlazaPosts() {
  let query = supabase
    .from("plaza_posts")
    .select(`
      id,
      user_id,
      category,
      title,
      nickname,
      created_at,
      body,
      thumbnail,
      score,
      up_count,
      view_count,
      plaza_comments(count)
    `)
    .order("score", { ascending: false })
    .order("created_at", { ascending: false });

  if (currentCategory !== "전체") {
    query = query.eq("category", currentCategory);
  }

  const { data, error } = await query;

  if (error) {
    console.error("❌ plaza fetch error:", error);
    if (plazaListEl) plazaListEl.innerHTML =
      `<li class="plaza-post empty">광장을 불러오지 못했어요. <button type="button" id="plaza-retry" style="color:#7aa0ff;background:none;border:0;font-weight:800;cursor:pointer">다시 시도</button></li>`;
    document.getElementById("plaza-retry")?.addEventListener("click", () => fetchPlazaPosts());
    return;
  }

  const posts = data || [];

  // ⚠️ 아래 보강 조회(프로필/저장/투표)는 '있으면 좋은' 부가정보다.
  //    하나라도 실패해도 목록 자체는 반드시 떠야 한다 — 예전엔 여기서 던지면 광장이 통째로 백지가 됐다.
  // 작성자 배지(아바타·등급)용 프로필 프리페치
  try {
    if (window.GALLA_userMap) await window.GALLA_userMap(posts.map(p => p.user_id));
  } catch (e) { console.warn("[plaza] userMap skip:", e); }

  // 내 저장/투표 상태 로드 (로그인 시)
  MY_PLAZA_SAVED = {};
  MY_PLAZA_VOTES = {};
  try {
    const { data: sess } = await supabase.auth.getSession();
    PLAZA_ME = sess?.session?.user || null;
    if (PLAZA_ME && posts.length) {
      const ids = posts.map(p => p.id);
      const [bmRes, vRes] = await Promise.all([
        supabase.from("plaza_bookmarks").select("post_id").eq("user_id", PLAZA_ME.id).in("post_id", ids),
        supabase.from("plaza_votes").select("post_id, vote").eq("user_id", PLAZA_ME.id).in("post_id", ids)
      ]);
      (bmRes.data || []).forEach(b => { MY_PLAZA_SAVED[b.post_id] = true; });
      (vRes.data || []).forEach(v => { MY_PLAZA_VOTES[v.post_id] = v.vote; });
    }
  } catch (e) { console.warn("[plaza] my-state skip:", e); }

  renderPlazaPosts(posts);
}

let PLAZA_ME = null;
let MY_PLAZA_SAVED = {};
let MY_PLAZA_VOTES = {};

// 외부 커뮤 썸네일은 핫링크 차단이 많아 galla.im 자체 프록시(/imgproxy)로 경유시킨다.
// 로컬(/...)·Supabase 스토리지·이미 프록시된 URL은 그대로 둔다.
function proxifyThumb(u) {
  if (!u || typeof u !== "string") return u;
  if (u.startsWith("/") || u.includes("/imgproxy?") || u.includes("supabase.co/storage")) return u;
  if (!/^https?:\/\//i.test(u)) return u;
  return "/imgproxy?u=" + encodeURIComponent(u);
}

function renderPlazaPosts(posts) {
  if (!plazaListEl) { console.warn("[plaza] .plaza-list 없음 — 렌더 스킵"); return; }
  plazaListEl.innerHTML = "";

  if (posts.length === 0) {
    plazaListEl.innerHTML = `<li class="plaza-post empty">글이 없습니다.</li>`;
    return;
  }

  posts.forEach(post => {
    const li = document.createElement("li");
    li.className = "plaza-post";
    const thumb = (window.GALLA_thumb ? window.GALLA_thumb(proxifyThumb(post.thumbnail) || extractFirstImage(post.body), 480) : (proxifyThumb(post.thumbnail) || extractFirstImage(post.body)));
    const cmtCount = post.plaza_comments?.[0]?.count ?? 0;
    const saved = !!MY_PLAZA_SAVED[post.id];
    const excerpt = plazaExcerpt(post.body);
    li.innerHTML = `
      <a href="plaza_detail.html?id=${post.id}" class="plaza-link">
        <div class="post-body">
          <div class="post-head">
            <span class="post-cat">${escP(post.category || "광장")}</span>
            <span class="post-author">${post.user_id && window.GALLA_userBadge
              ? window.GALLA_userBadge(post.user_id, post.nickname)
              : escP(post.nickname || "익명")}</span>
            <span class="post-time">${timeAgoK(post.created_at)}</span>
          </div>
          <div class="post-title">${escP(post.title)}</div>
          ${excerpt ? `<div class="post-excerpt">${escP(excerpt)}</div>` : ""}
          <div class="post-stats">
            <span class="pv-vote">
              <button class="pv-btn pv-up ${MY_PLAZA_VOTES[post.id] === 1 ? "on" : ""}" data-id="${post.id}" data-v="1" aria-label="추천">
                <svg viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg>
              </button>
              <span class="pv-score" data-id="${post.id}">${post.score || 0}</span>
              <button class="pv-btn pv-down ${MY_PLAZA_VOTES[post.id] === -1 ? "on" : ""}" data-id="${post.id}" data-v="-1" aria-label="비추천">
                <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
              </button>
            </span>
            <span class="pv-cmt">
              <svg class="ic-comment" viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.6 8.6 0 0 1-3.9-.9L3.5 20.5l1.4-5.1a8.4 8.4 0 0 1-.9-3.9A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z"/></svg>
              ${cmtCount}
            </span>
            <span>조회 ${post.view_count || 0}</span>
            <button class="plaza-save-btn ${saved ? "on" : ""}" data-id="${post.id}" aria-label="저장">
              <svg class="ic-bookmark" viewBox="0 0 24 24"><path d="M18 21l-6-4.3L6 21V5.5A2.5 2.5 0 0 1 8.5 3h7A2.5 2.5 0 0 1 18 5.5V21z"/></svg>
            </button>
            <button class="plaza-share-btn" data-id="${post.id}" data-title="${(post.title || "").replace(/"/g, "&quot;")}" aria-label="공유">
              <svg class="ic-share" viewBox="0 0 24 24"><path d="M21.5 2.5L10.8 13.2"/><path d="M21.5 2.5l-6.8 19-3.9-8.3-8.3-3.9 19-6.8z"/></svg>
            </button>
          </div>
        </div>

        ${
          thumb
            ? `<div class="plaza-thumb">
                 <img src="${thumb}" alt="" loading="lazy" style="opacity:0;transition:opacity .18s"
                      onload="this.style.opacity=1"
                      onerror="this.closest('.plaza-thumb')?.remove()" />
               </div>`
            : ``
        }
      </a>
    `;
    plazaListEl.appendChild(li);
  });
}

/* 공용 공유 (Web Share API + 클립보드 폴백) */
async function gallaShare(title, url) {
  const t = title ? `💬 ${title}` : "GALLA 광장";
  if (window.GALLA_share) return window.GALLA_share({ url, title: t, text: "갈라 광장에서 지금 뜨거운 이야기" });
  if (navigator.share) {
    try { await navigator.share({ title: t, text: "갈라 광장에서 지금 뜨거운 이야기", url }); return; }
    catch (err) { if (err.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(url); alert("링크가 복사되었습니다."); }
  catch { alert("링크 복사에 실패했습니다."); }
}

/* 목록 카드 공유 (이벤트 위임) */
plazaListEl?.addEventListener("click", (e) => {
  const btn = e.target.closest(".plaza-share-btn");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  gallaShare(btn.dataset.title, window.GALLA_shareUrl ? window.GALLA_shareUrl('plaza', btn.dataset.id) : new URL(`plaza_detail.html?id=${btn.dataset.id}`, location.href).href);
});

/* 목록 카드 업/다운 투표 (레딧식, 이벤트 위임) */
let plazaVoting = false;
plazaListEl?.addEventListener("click", async (e) => {
  const btn = e.target.closest(".pv-btn");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  if (plazaVoting) return;

  const { data: sess } = await supabase.auth.getSession();
  const session = sess?.session;
  if (!session?.user) {
    if (confirm("투표하려면 로그인이 필요합니다. 로그인하시겠어요?")) location.href = "login.html";
    return;
  }

  const id = btn.dataset.id;
  const val = Number(btn.dataset.v);
  const scoreEl = plazaListEl.querySelector(`.pv-score[data-id="${id}"]`);
  const wrap = btn.closest(".pv-vote");
  const upB = wrap.querySelector(".pv-up"), downB = wrap.querySelector(".pv-down");

  plazaVoting = true;
  try {
    const { data, error } = await supabase.rpc("vote_plaza_post", { p_post_id: id, p_value: val });
    if (error) { console.error(error); alert("투표 처리 실패"); return; }
    const row = Array.isArray(data) ? data[0] : data;
    if (row && typeof row.score === "number" && scoreEl) scoreEl.textContent = String(row.score);
    const mv = row?.my_vote ?? 0;
    MY_PLAZA_VOTES[id] = mv;
    upB.classList.toggle("on", mv === 1);
    downB.classList.toggle("on", mv === -1);
  } finally {
    plazaVoting = false;
  }
});

/* 목록 카드 저장 토글 (이벤트 위임) */
plazaListEl?.addEventListener("click", async (e) => {
  const btn = e.target.closest(".plaza-save-btn");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();

  const { data: sess } = await supabase.auth.getSession();
  const user = sess?.session?.user;
  if (!user) {
    if (confirm("저장하려면 로그인이 필요합니다. 로그인하시겠어요?")) location.href = "login.html";
    return;
  }
  const id = btn.dataset.id;
  btn.disabled = true;
  try {
    if (MY_PLAZA_SAVED[id]) {
      await supabase.from("plaza_bookmarks").delete().eq("post_id", id).eq("user_id", user.id);
      delete MY_PLAZA_SAVED[id];
    } else {
      await supabase.from("plaza_bookmarks").insert({ post_id: id, user_id: user.id });
      MY_PLAZA_SAVED[id] = true;
    }
    btn.classList.toggle("on", !!MY_PLAZA_SAVED[id]);
    const txt = btn.querySelector(".save-txt");
    if (txt) txt.textContent = MY_PLAZA_SAVED[id] ? "저장됨" : "저장";
  } catch (err) {
    console.error("[plaza save]", err);
  } finally {
    btn.disabled = false;
  }
});


/* =========================
   SUBMIT → SUPABASE (FIXED)
========================= */

submitBtn && submitBtn.addEventListener("click", async (e) => {
  e.preventDefault();

  validatePlazaForm();
  if (submitBtn.disabled) return;

  // 정통망법 대비: 작성자 기록 필수 (익명은 표시만)
  const user = await requirePlazaLogin();
  if (!user) return;

  submitBtn.disabled = true;

  const category = categorySelect.value.trim();
  const title = titleInput.value.trim();

  // 광장 글은 실명 (익명은 유령권 댓글 전용)
  const { data: prof } = await supabase
    .from("user_profiles")
    .select("nickname")
    .eq("user_id", user.id)
    .maybeSingle();
  const displayName = prof?.nickname || "사용자";

  const body = bodyInput.value;

  const firstImageMatch = body.match(/\[IMAGE\](.+)/);
  const thumbnail = firstImageMatch ? firstImageMatch[1] : null;

  const payload = {
    category,
    title,
    body,
    thumbnail,
    nickname: displayName,
    user_id: user.id
  };

  const { error } = await supabase
    .from("plaza_posts")
    .insert(payload);

  if (error) {
    console.error("plaza insert error:", error);
    plazaToast("글 등록 중 오류가 발생했어요");   // 네이티브 alert → 갈라 토스트(다크톤)
    submitBtn.disabled = false;
    return;
  }

  /* 성공 — 폼만 비우고, 모달 close(=composer history.back→create)는 '타지 않는다'.
     대신 광장으로 직접 replace 이동. 그래야 create로 되돌아가지 않고 자기 글이 뜬
     광장에 착지한다(사장님 QA). 이미 광장 탭이면 그대로 두고 목록만 갱신. */
  categorySelect.value = "";
  titleInput.value = "";
  charCount.textContent = "0";
  submitBtn.disabled = true;
  bodyInput.value = "";
  if (attachStrip) { attachStrip.hidden = true; attachStrip.innerHTML = ""; }

  /* 발행 후 광장 목록으로 착지. create('새로 만들기') 경유(URL compose=1)면 composer가
     닫힐 때 history.back(→create)로 되돌리므로, 모달을 닫지 말고 광장으로 직접 이동한다.
     완료 토스트는 sessionStorage 플래그로 착지 화면에서 띄운다. */
  /* 발행 성공 — 페이지 이동 없이 '뒤에 있는 광장 목록'을 노출한다(composer-page가
     발행 닫기를 create 복귀 대신 그 자리 유지로 처리). compose=1 진입이든 인페이지든
     동일하게 광장 탭을 활성화하고 목록만 갱신 → 자기 글이 맨 위에 뜬다. */
  if (__plazaDraft) __plazaDraft.clear();      // 발행 성공 → 임시저장 삭제
  if (window.__composerStayOnPublish) window.__composerStayOnPublish();
  closePlazaWriteModal();
  const tab = document.querySelector('.tab-item[data-tab="plaza"]');
  if (tab && window.GALLA_trendSetTab) window.GALLA_trendSetTab('plaza');
  else if (tab) tab.click();
  plazaToast("광장에 글을 올렸어요 🎉");
  fetchPlazaPosts();
});

/* ── 갈라 톤 토스트 (네이티브 alert 대체) ── */
function plazaToast(msg) {
  let t = document.getElementById("plazaToast");
  if (!t) {
    t = document.createElement("div");
    t.id = "plazaToast";
    t.style.cssText = "position:fixed;left:50%;bottom:calc(88px + env(safe-area-inset-bottom,0px));" +
      "transform:translateX(-50%) translateY(8px);z-index:2147483400;max-width:88vw;" +
      "padding:12px 18px;border-radius:14px;background:rgba(24,26,34,.97);color:#fff;" +
      "font-size:14px;font-weight:800;border:1px solid rgba(255,255,255,.12);" +
      "box-shadow:0 12px 34px rgba(0,0,0,.55);opacity:0;transition:opacity .2s,transform .2s;pointer-events:none";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "translateX(-50%) translateY(0)"; });
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateX(-50%) translateY(8px)"; }, 2200);
}
/* 광장 목록으로 — 트렌드 통합이라 광장 탭 활성화. 이 페이지에 광장 탭이 있으면 true. */
function goPlazaList() {
  try {
    const tab = document.querySelector('.tab-item[data-tab="plaza"]');
    if (!tab) return false;
    if (window.GALLA_trendSetTab) window.GALLA_trendSetTab("plaza");
    else tab.click();
    return true;
  } catch (_) { return false; }
}

/* =========================
   INIT
========================= */

/* =========================
   REALTIME: SCORE UPDATE
   - vote 발생 시 리스트 재정렬
========================= */

supabase
  .channel("plaza-posts-realtime")
  .on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "plaza_posts",
    },
    (payload) => {
      console.log("🔄 plaza post updated:", payload);
      fetchPlazaPosts(); // 점수 변경 시 즉시 재정렬
    }
  )
  .subscribe();

// 초기 로드 — 실패해도 조용히 죽지 않게(리트라이 UI는 함수 내부에서 처리)
fetchPlazaPosts().catch(e => console.error("[plaza] 초기 로드 실패:", e));

/* 광장 발행 후 이 화면으로 착지했으면 완료 토스트를 여기서 띄운다(이동 뒤라 확실히 보임) */
try {
  if (sessionStorage.getItem('galla_plaza_posted')) {
    sessionStorage.removeItem('galla_plaza_posted');
    setTimeout(() => plazaToast("광장에 글을 올렸어요 🎉"), 400);
  }
} catch (_) {}