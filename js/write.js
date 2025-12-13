console.log("[write.js] loaded");

/* ==========================================================================
   0. Utils
========================================================================== */
function qs(id) {
  return document.getElementById(id);
}

/* ==========================================================================
   1. Supabase / Auth Check
========================================================================== */
const supabase = window.supabaseClient;

(async function checkAuth() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    alert("로그인이 필요합니다.");
    location.href = "login.html";
  }
})();

/* ==========================================================================
   2. Text Counter
========================================================================== */
const desc = qs("description");
const counter = document.querySelector(".desc-counter");

desc.addEventListener("input", () => {
  counter.innerText = `${desc.value.length} / 500`;
});

/* ==========================================================================
   3. File Input Trigger
========================================================================== */
qs("thumbnailBtn").onclick = () => qs("thumbnail").click();
qs("videoBtn").onclick = () => qs("videoInput").click();

/* ==========================================================================
   4. File Validation
========================================================================== */
let thumbnailFile = null;
let videoFile = null;

qs("thumbnail").onchange = e => {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("이미지 파일만 업로드 가능합니다.");
    return;
  }

  thumbnailFile = file;
  qs("thumbnailBtn").innerText = "썸네일 선택됨";
};

qs("videoInput").onchange = e => {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("video/")) {
    alert("영상 파일만 업로드 가능합니다.");
    return;
  }

  videoFile = file;
  qs("videoBtn").innerText = "영상 선택됨";
};

/* ==========================================================================
   5. AI 글 다듬기 (Supabase Edge Function)
========================================================================== */
const aiBtn = qs("openAiModal");
const aiModal = qs("aiModal");
const aiCloseBtn = qs("aiCloseBtn");
const aiUserText = qs("aiUserText");
const aiImprovedText = qs("aiImprovedText");
const applyAiText = qs("applyAiText");

let currentStyle = "basic";
let currentOptions = [];
let aiLoading = false;

/* --- 모달 열기 --- */
if (aiBtn && aiModal) {
  aiBtn.onclick = () => {
    aiUserText.value = desc.value;
    aiImprovedText.value = "";
    currentStyle = "basic";
    currentOptions = [];

    document
      .querySelectorAll(".ai-style-tabs button")
      .forEach(b => b.classList.remove("active"));
    document
      .querySelector('.ai-style-tabs button[data-style="basic"]')
      ?.classList.add("active");

    document
      .querySelectorAll(".ai-summary-options button")
      .forEach(b => b.classList.remove("active"));

    aiModal.style.display = "block";
  };
}

/* --- 모달 닫기 --- */
if (aiCloseBtn) {
  aiCloseBtn.onclick = () => {
    aiModal.style.display = "none";
  };
}

/* --- 스타일 선택 --- */
document.querySelectorAll(".ai-style-tabs button").forEach(btn => {
  btn.onclick = () => {
    document
      .querySelectorAll(".ai-style-tabs button")
      .forEach(b => b.classList.remove("active"));

    btn.classList.add("active");
    currentStyle = btn.dataset.style;
  };
});

/* --- 옵션 토글 --- */
document.querySelectorAll(".ai-summary-options button").forEach(btn => {
  btn.onclick = () => {
    const opt = btn.dataset.option;
    if (currentOptions.includes(opt)) {
      currentOptions = currentOptions.filter(o => o !== opt);
      btn.classList.remove("active");
    } else {
      currentOptions.push(opt);
      btn.classList.add("active");
    }
  };
});

/* --- AI 호출 (버튼 기반) --- */
aiUserText.addEventListener("change", async () => {
  if (!aiUserText.value.trim() || aiLoading) return;

  aiLoading = true;
  aiImprovedText.value = "AI가 글을 다듬고 있습니다...";

  const { data, error } = await supabase.functions.invoke("ai-polish", {
    body: {
      text: aiUserText.value,
      style: currentStyle,
      options: currentOptions,
    },
  });

  aiLoading = false;

  if (error) {
    console.error(error);
    aiImprovedText.value = error.message || "AI 처리 중 오류가 발생했습니다.";
    return;
  }

  aiImprovedText.value = data?.result || "";
});

/* --- AI 결과 적용 --- */
applyAiText.onclick = () => {
  if (!aiImprovedText.value.trim()) return;
  desc.value = aiImprovedText.value;
  counter.innerText = `${desc.value.length} / 500`;
  aiModal.style.display = "none";
};

/* ==========================================================================
   6. Submit
========================================================================== */
let submitting = false;

qs("writeForm").onsubmit = async e => {
  e.preventDefault();
  if (submitting) return;

  const category = qs("category").value;
  const title = qs("title").value.trim();
  const oneLine = qs("oneLine").value.trim();
  const description = desc.value.trim();

  if (!category || !title || !oneLine || !description || !thumbnailFile) {
    alert("필수 항목을 모두 입력해주세요.");
    return;
  }

  submitting = true;

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session.user;

  /* === Thumbnail Upload === */
  const thumbPath = `thumbnails/${user.id}_${Date.now()}.jpg`;

  const { error: thumbError } = await supabase.storage
    .from("issues")
    .upload(thumbPath, thumbnailFile);

  if (thumbError) {
    submitting = false;
    alert("썸네일 업로드 실패");
    return;
  }

  /* === Video Upload (optional) === */
  let videoPath = null;

  if (videoFile) {
    videoPath = `videos/${user.id}_${Date.now()}.mp4`;

    const { error: videoError } = await supabase.storage
      .from("issues")
      .upload(videoPath, videoFile);

    if (videoError) {
      submitting = false;
      alert("영상 업로드 실패");
      return;
    }
  }

  /* === Insert Issue === */
  const { error } = await supabase.from("issues").insert({
    category,
    title,
    one_line: oneLine,
    description,
    thumbnail_url: thumbPath,
    video_url: videoPath,
    user_id: user.id,
    status: "normal",
  });

  submitting = false;

  if (error) {
    console.error(error);
    alert("이슈 등록 실패");
    return;
  }

  alert("갈라가 발의되었습니다.");
  location.href = "index.html";
};

/* ==========================================================================
   7. Bottom Nav
========================================================================== */
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.onclick = () => {
    const target = btn.dataset.target;
    if (target) location.href = target;
  };
});