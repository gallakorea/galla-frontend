/* =========================
   SUPABASE CLIENT INIT
========================= */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://bidqauputnhkqepvdzrr";
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

function closePlazaWriteModal() {
  modal.classList.add("hidden");
  document.body.style.overflow = "";
}

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
const bodyInput = document.getElementById("plaza-body");
const submitBtn = document.getElementById("plaza-submit");
const charCount = document.getElementById("char-count");

/* =========================
   300자 카운터
========================= */

bodyInput.addEventListener("input", () => {
  charCount.textContent = bodyInput.value.length;
  validatePlazaForm();
});

titleInput.addEventListener("input", validatePlazaForm);
categorySelect.addEventListener("change", validatePlazaForm);

/* =========================
   VALIDATION
   - 카테고리 필수
   - 제목/본문 필수
========================= */

function validatePlazaForm() {
  const hasCategory = categorySelect.value.trim() !== "";
  const hasTitle = titleInput.value.trim().length > 0;
  const hasBody = bodyInput.value.trim().length > 0;

  submitBtn.disabled = !(hasCategory && hasTitle && hasBody);
}

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
    .select("id, category, title, created_at")
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
      <div class="vote-col">▲<br>0<br>▼</div>
      <div class="post-body">
        <div class="post-title">${post.title}</div>
        <div class="post-meta">${post.category} · 방금 전</div>
      </div>
    `;
    plazaListEl.appendChild(li);
  });
}

/* =========================
   SUBMIT → SUPABASE (FIXED)
========================= */

submitBtn.addEventListener("click", async (e) => {
  e.preventDefault();

  validatePlazaForm();
  if (submitBtn.disabled) return;

  submitBtn.disabled = true;

  const category = categorySelect.value.trim();
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();
  const anonName = generateAnonNickname();

  const { error } = await supabase
    .from("plaza_posts")
    .insert({
      category: category,
      title: title,
      body: body,
      anon_name: anonName
    });

  if (error) {
    console.error("plaza insert error:", error);
    alert("글 등록 중 오류가 발생했습니다.");
    submitBtn.disabled = false;
    return;
  }

  // 성공 처리
  closePlazaWriteModal();

  categorySelect.value = "";
  titleInput.value = "";
  bodyInput.value = "";
  charCount.textContent = "0";
  submitBtn.disabled = true;

  // 리스트 즉시 갱신
  fetchPlazaPosts();
});

/* =========================
   INIT
========================= */

fetchPlazaPosts();