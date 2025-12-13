console.log("[write.js] loaded");

/* =========================
   Utils
========================= */
function qs(id) {
  return document.getElementById(id);
}

function getSupabase() {
  if (!window.supabaseClient) {
    alert("시스템 초기화 중입니다. 새로고침 해주세요.");
    throw new Error("Supabase not ready");
  }
  return window.supabaseClient;
}

/* =========================
   Auth Check
========================= */
(async () => {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    alert("로그인이 필요합니다.");
    location.href = "login.html";
  }
})();

/* =========================
   Counter
========================= */
const desc = qs("description");
const counter = document.querySelector(".desc-counter");
desc.addEventListener("input", () => {
  counter.textContent = `${desc.value.length} / 500`;
});

/* =========================
   File Upload
========================= */
let thumbnailFile = null;
let videoFile = null;

qs("thumbnailBtn").onclick = () => qs("thumbnail").click();
qs("videoBtn").onclick = () => qs("videoInput").click();

qs("thumbnail").onchange = e => {
  const f = e.target.files[0];
  if (!f || !f.type.startsWith("image/")) return alert("이미지 파일만 가능");
  thumbnailFile = f;
  qs("thumbnailBtn").textContent = "썸네일 선택됨";
};

qs("videoInput").onchange = e => {
  const f = e.target.files[0];
  if (!f || !f.type.startsWith("video/")) return alert("영상 파일만 가능");
  videoFile = f;
  qs("videoBtn").textContent = "영상 선택됨";
};

/* =========================
   AI
========================= */
const aiModal = qs("aiModal");
const aiBtn = qs("openAiModal");
const aiClose = qs("aiCloseBtn");
const runAiBtn = qs("runAiBtn");
const applyAi = qs("applyAiText");

const aiUserText = qs("aiUserText");
const aiImprovedText = qs("aiImprovedText");

let aiStyle = "basic";

document.querySelectorAll(".ai-style-tabs button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".ai-style-tabs button")
      .forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    aiStyle = btn.dataset.style;
  };
});

aiBtn.onclick = () => {
  aiUserText.value = desc.value;
  aiImprovedText.value = "";
  aiModal.style.display = "block";
};

aiClose.onclick = () => aiModal.style.display = "none";

runAiBtn.onclick = async () => {
  if (!aiUserText.value.trim()) return;

  aiImprovedText.value = "AI가 글을 다듬고 있습니다...";
  const supabase = getSupabase();

  const { data, error } = await supabase.functions.invoke("ai-polish", {
    body: { text: aiUserText.value, style: aiStyle }
  });

  if (error) {
    aiImprovedText.value = "AI 오류 발생";
    return;
  }

  aiImprovedText.value = data.result;
};

applyAi.onclick = () => {
  if (!aiImprovedText.value.trim()) return;
  desc.value = aiImprovedText.value;
  counter.textContent = `${desc.value.length} / 500`;
  aiModal.style.display = "none";
};

/* =========================
   Submit
========================= */
qs("writeForm").onsubmit = async e => {
  e.preventDefault();

  if (!thumbnailFile) return alert("썸네일 필수");

  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const user = data.session.user;

  const thumbPath = `thumbnails/${user.id}_${Date.now()}.jpg`;
  await supabase.storage.from("issues").upload(thumbPath, thumbnailFile);

  let videoPath = null;
  if (videoFile) {
    videoPath = `videos/${user.id}_${Date.now()}.mp4`;
    await supabase.storage.from("issues").upload(videoPath, videoFile);
  }

  const { error } = await supabase.from("issues").insert({
    category: qs("category").value,
    title: qs("title").value.trim(),
    one_line: qs("oneLine").value.trim(),
    description: desc.value.trim(),
    thumbnail_url: thumbPath,
    video_url: videoPath,
    status: "normal",
  });

  if (error) return alert("등록 실패");

  alert("갈라 발의 완료");
  location.href = "index.html";
};

/* =========================
   Nav
========================= */
document.querySelectorAll(".nav-item").forEach(b => {
  b.onclick = () => b.dataset.target && (location.href = b.dataset.target);
});