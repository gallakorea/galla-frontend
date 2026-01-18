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

const bodyInput = document.getElementById("plaza-body");

bodyInput?.addEventListener("input", () => {
  charCount.textContent = bodyInput.value.length;
  validatePlazaForm();
});

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
   IMAGE INSERT (TEXTAREA)
========================= */

const addImageBtn = document.getElementById("addImage");

const imageInput = document.createElement("input");
imageInput.type = "file";
imageInput.accept = "image/*";
imageInput.style.display = "none";
document.body.appendChild(imageInput);

addImageBtn?.addEventListener("click", () => {
  imageInput.click();
});

imageInput.addEventListener("change", async () => {
  const file = imageInput.files[0];
  if (!file) return;

  const ext = file.name.split(".").pop();
  const fileName = `plaza_${Date.now()}.${ext}`;

  const { error } = await supabase
    .storage
    .from("plaza-images")
    .upload(fileName, file);

  if (error) {
    alert("이미지 업로드 실패");
    console.error(error);
    return;
  }

  const { data } = supabase
    .storage
    .from("plaza-images")
    .getPublicUrl(fileName);

  insertImageIntoTextarea(data.publicUrl);
  imageInput.value = "";
});

function insertImageIntoTextarea(url) {
  const start = bodyInput.selectionStart;
  const end = bodyInput.selectionEnd;

  const tag = `\n[IMAGE]${url}\n`;

  bodyInput.value =
    bodyInput.value.substring(0, start) +
    tag +
    bodyInput.value.substring(end);

  bodyInput.selectionStart =
    bodyInput.selectionEnd =
    start + tag.length;

  bodyInput.focus();
  charCount.textContent = bodyInput.value.length;
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

function extractFirstImage(body) {
  if (!body) return null;
  const match = body.match(/\[IMAGE\](https?:\/\/[^\s]+)/);
  return match ? match[1] : null;
}

async function fetchPlazaPosts() {
  let query = supabase
    .from("plaza_posts")
    .select("id, category, title, nickname, created_at, body, thumbnail, score")
    .order("score", { ascending: false })
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
    const thumb = post.thumbnail || extractFirstImage(post.body);
    li.innerHTML = `
      <a href="plaza_detail.html?id=${post.id}" class="plaza-link">
        <div class="post-body">
          <div class="post-title">${post.title}</div>
          <div class="post-meta">
            ${post.nickname} · ${post.category} · 방금 전
          </div>
        </div>

        ${
          thumb
            ? `<div class="plaza-thumb">
                 <img src="${thumb}" alt="thumbnail" />
               </div>`
            : ``
        }
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

  const body = bodyInput.value;

  const firstImageMatch = body.match(/\[IMAGE\](.+)/);
  const thumbnail = firstImageMatch ? firstImageMatch[1] : null;

  const payload = {
    category,
    title,
    body,
    thumbnail,
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

  bodyInput.value = "";

  // 리스트 즉시 갱신
  fetchPlazaPosts();
});

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

fetchPlazaPosts();