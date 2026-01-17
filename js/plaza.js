/* =========================
   SUPABASE CLIENT INIT
========================= */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://bidqauputnhkqepvdzrr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
/* =========================
   LIST STATE
========================= */

const plazaListEl = document.querySelector(".plaza-list");
let currentCategory = "전체";

/* =========================
   MODAL OPEN / CLOSE
========================= */

const modal = document.getElementById("plaza-write-modal");

function openPlazaWriteModal() {
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
// expose for inline HTML handlers
window.openPlazaWriteModal = openPlazaWriteModal;

function closePlazaWriteModal() {
  modal.classList.add("hidden");
  document.body.style.overflow = "";
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

/* =========================
   300자 카운터
========================= */

titleInput && titleInput.addEventListener("input", validatePlazaForm);
categorySelect && categorySelect.addEventListener("change", validatePlazaForm);

/* =========================
   VALIDATION
   - 카테고리 필수
   - 제목/본문 필수
========================= */

function validatePlazaForm() {
  const hasCategory = categorySelect.value.trim() !== "";
  const hasTitle = titleInput.value.trim().length > 0;
  const hasContent = editorContent.length > 0;

  submitBtn.disabled = !(hasCategory && hasTitle && hasContent);
}
// ===== Lightweight Editor State =====
const editorEl = document.getElementById("editor");
const addTextBtn = document.getElementById("addText");
const addImageBtn = document.getElementById("addImage");
const addLinkBtn = document.getElementById("addLink");
const coverImageInput = document.getElementById("coverImageInput");

let editorContent = [];
let coverImageUrl = null;

addTextBtn?.addEventListener("click", () => {
  const div = document.createElement("div");
  div.className = "editor-text";
  div.contentEditable = true;
  div.dataset.index = editorContent.length;
  div.addEventListener("input", () => {
    const idx = Number(div.dataset.index);
    editorContent[idx].value = div.textContent;
    validatePlazaForm();
  });
  editorEl.appendChild(div);
  editorContent.push({ type: "text", value: "" });
});

addLinkBtn?.addEventListener("click", () => {
  const url = prompt("링크 URL");
  if (!url) return;
  const title = prompt("링크 제목") || url;

  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.textContent = title;
  a.className = "editor-link";
  editorEl.appendChild(a);

  editorContent.push({ type: "link", url, title });
  validatePlazaForm();
});

addImageBtn?.addEventListener("click", async () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;

    const path = `plaza/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("images").upload(path, file);
    if (error) return alert("이미지 업로드 실패");

    const { data } = supabase.storage.from("images").getPublicUrl(path);

    const img = document.createElement("img");
    img.src = data.publicUrl;
    img.className = "editor-image";
    editorEl.appendChild(img);

    editorContent.push({ type: "image", url: data.publicUrl });
    validatePlazaForm();
  };
  input.click();
});

coverImageInput?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const path = `plaza/cover_${Date.now()}_${file.name}`;
  const { error } = await supabase.storage.from("images").upload(path, file);
  if (error) return alert("대표 이미지 업로드 실패");

  const { data } = supabase.storage.from("images").getPublicUrl(path);
  coverImageUrl = data.publicUrl;
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

async function fetchPlazaPosts() {
  let query = supabase
    .from("plaza_posts")
    .select("id, category, title, nickname, created_at")
    .order("created_at", { ascending: false });

  if (currentCategory !== "전체") {
    query = query.eq("category", currentCategory);
  }

  const { data, error } = await query;

  if (error) {
    console.error("plaza fetch error:", error);
    return;
  }

  renderPlazaPosts(data || []);
}

function renderPlazaPosts(posts) {
  plazaListEl.innerHTML = "";

  if (posts.length === 0) {
    plazaListEl.innerHTML = `<li class="plaza-post empty">글이 없습니다.</li>`;
    return;
  }

  posts.forEach(post => {
    const li = document.createElement("li");
    li.className = "plaza-post";

    li.innerHTML = `
      <a href="plaza_detail.html?id=${post.id}" class="plaza-link">
        <div class="post-body">
          <div class="post-title">${post.title}</div>
          <div class="post-meta">
            ${post.nickname} · ${post.category} · 방금 전
          </div>
        </div>
      </a>
    `;

    plazaListEl.appendChild(li);
  });
}


/* =========================
   SUBMIT → SUPABASE (FIXED)
========================= */

submitBtn && submitBtn.addEventListener("click", async (e) => {
  e.preventDefault();

  validatePlazaForm();
  if (submitBtn.disabled) return;

  submitBtn.disabled = true;

  const category = categorySelect.value.trim();
  const title = titleInput.value.trim();
  const anonName = generateAnonNickname();

  const payload = {
    category,
    title,
    content: editorContent,
    cover_image: coverImageUrl,
    nickname: anonName
  };

  console.log("plaza insert payload:", payload);

  const { error } = await supabase
    .from("plaza_posts")
    .insert(payload);

  if (error) {
    console.error("plaza insert error:", error);
    alert("글 등록 중 오류가 발생했습니다.");
    submitBtn.disabled = false;
    return;
  }

  /* ✅⬇️ 바로 여기 */
  alert("등록이 완료되었습니다.");

  // 성공 처리
  closePlazaWriteModal();

  categorySelect.value = "";
  titleInput.value = "";
  charCount.textContent = "0";
  submitBtn.disabled = true;

  // 에디터 상태 초기화
  editorContent = [];
  if (editorEl) editorEl.innerHTML = "";
  coverImageUrl = null;
  if (coverImageInput) coverImageInput.value = "";

  // 리스트 즉시 갱신
  fetchPlazaPosts();
});

/* =========================
   INIT
========================= */

fetchPlazaPosts();