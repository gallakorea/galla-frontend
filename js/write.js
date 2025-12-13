console.log("[write.js] loaded");

const supabase = window.supabaseClient;
const qs = (id) => document.getElementById(id);

const desc = qs("description");
const counter = document.querySelector(".desc-counter");

desc.addEventListener("input", () => {
  counter.innerText = `${desc.value.length} / 500`;
});

/* ===== AI ===== */
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

document.querySelectorAll(".ai-style-tabs button").forEach((btn) => {
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
      options: [],
      customPrompt: aiCustomPrompt.value,
    },
  });

  if (error) {
    aiImprovedText.value = "AI 오류 발생";
    return;
  }

  aiImprovedText.value = data.result || "";
};

qs("applyAiText").onclick = () => {
  desc.value = aiImprovedText.value;
  counter.innerText = `${desc.value.length} / 500`;
  aiModal.style.display = "none";
};

/* ===== SUBMIT ===== */
qs("writeForm").onsubmit = async (e) => {
  e.preventDefault();

  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    alert("로그인이 필요합니다");
    return;
  }

  const payload = {
    category: qs("category").value,
    title: qs("title").value,
    one_line: qs("oneLine").value,
    description: desc.value,
    user_id: data.session.user.id,
    status: "normal",
  };

  const { error } = await supabase.from("issues").insert(payload);

  if (error) {
    alert("등록 실패");
    return;
  }

  alert("갈라 발의 완료");
  location.href = "index.html";
};