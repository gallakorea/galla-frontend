console.log("[write.js] loaded");

const supabase = window.supabaseClient;
const qs = (id) => document.getElementById(id);

/* ================== COUNTER ================== */
const desc = qs("description");
const counter = document.querySelector(".desc-counter");

desc.addEventListener("input", () => {
  counter.innerText = `${desc.value.length} / 500`;
});

/* ================== FILE UPLOAD ================== */
let thumbnailFile = null;
let videoFile = null;

qs("thumbnailBtn").onclick = () => qs("thumbnail").click();
qs("videoBtn").onclick = () => qs("videoInput").click();

qs("thumbnail").onchange = (e) => {
  thumbnailFile = e.target.files[0];
  if (thumbnailFile) {
    qs("thumbnailBtn").innerText = "썸네일 선택됨";
  }
};

qs("videoInput").onchange = (e) => {
  videoFile = e.target.files[0];
  if (videoFile) {
    qs("videoBtn").innerText = "영상 선택됨";
  }
};

/* ================== AI ================== */
const aiModal = qs("aiModal");
const aiUserText = qs("aiUserText");
const aiImprovedText = qs("aiImprovedText");
const aiCustomPrompt = qs("aiCustomPrompt");

let currentStyle = "basic";

qs("openAiModal").onclick = () => {
  aiUserText.value = desc.value;
  aiImprovedText.value = "";
  aiModal.style.display = "block";
};

qs("aiCloseBtn").onclick = () => {
  aiModal.style.display = "none";
};

document.querySelectorAll(".ai-style-tabs button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".ai-style-tabs button")
      .forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentStyle = btn.dataset.style;
  };
});

qs("runAi").onclick = async () => {
  aiImprovedText.value = "AI 처리 중...";

  const { data, error } = await supabase.functions.invoke("ai-polish", {
    body: {
      text: aiUserText.value,
      style: currentStyle,
      customPrompt: aiCustomPrompt.value
    }
  });

  if (error) {
    aiImprovedText.value = "AI 오류";
    return;
  }

  aiImprovedText.value = data.result || "";
};

qs("applyAiText").onclick = () => {
  desc.value = aiImprovedText.value;
  counter.innerText = `${desc.value.length} / 500`;
  aiModal.style.display = "none";
};

/* ================== SUBMIT ================== */
qs("writeForm").onsubmit = async (e) => {
  e.preventDefault();

  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    alert("로그인이 필요합니다");
    return;
  }

  if (!thumbnailFile) {
    alert("썸네일 필수");
    return;
  }

  const payload = {
    category: qs("category").value,
    title: qs("title").value,
    one_line: qs("oneLine").value,
    description: desc.value,
    user_id: data.session.user.id,
    status: "normal"
  };

  const { error } = await supabase.from("issues").insert(payload);

  if (error) {
    alert("등록 실패");
    return;
  }

  alert("갈라 발의 완료");
  location.href = "index.html";
};