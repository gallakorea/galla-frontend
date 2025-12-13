console.log("[write.js] loaded");

/* ==========================================================================
   0. Base
========================================================================== */
const supabase = window.supabaseClient;
const qs = (id) => document.getElementById(id);

/* ==========================================================================
   1. Auth Check (페이지 진입 시)
========================================================================== */
(async () => {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    alert("로그인이 필요합니다.");
    location.href = "login.html";
  }
})();

/* ==========================================================================
   2. Description Counter
========================================================================== */
const desc = qs("description");
const counter = document.querySelector(".desc-counter");

if (desc && counter) {
  counter.innerText = `${desc.value.length} / 500`;

  desc.addEventListener("input", () => {
    counter.innerText = `${desc.value.length} / 500`;
  });
}

/* ==========================================================================
   3. AI Modal Elements
========================================================================== */
const aiModal = qs("aiModal");
const openAiBtn = qs("openAiModal");
const aiCloseBtn = qs("aiCloseBtn");

const aiUserText = qs("aiUserText");
const aiImprovedText = qs("aiImprovedText");
const aiCustomPrompt = qs("aiCustomPrompt");
const runAiBtn = qs("runAi");
const applyAiBtn = qs("applyAiText");

let currentStyle = "basic";

/* ==========================================================================
   4. Open / Close AI Modal
========================================================================== */
if (openAiBtn) {
  openAiBtn.onclick = () => {
    aiUserText.value = desc.value || "";
    aiImprovedText.value = "";
    aiModal.style.display = "flex";
  };
}

if (aiCloseBtn) {
  aiCloseBtn.onclick = () => {
    aiModal.style.display = "none";
  };
}

/* ==========================================================================
   5. Style Tabs
========================================================================== */
document.querySelectorAll(".ai-style-tabs button").forEach((btn) => {
  btn.onclick = () => {
    document
      .querySelectorAll(".ai-style-tabs button")
      .forEach((b) => b.classList.remove("active"));

    btn.classList.add("active");
    currentStyle = btn.dataset.style;
  };
});

/* ==========================================================================
   6. Run AI (Edge Function)
========================================================================== */
if (runAiBtn) {
  runAiBtn.onclick = async () => {
    if (!aiUserText.value.trim()) {
      alert("다듬을 글을 입력해주세요.");
      return;
    }

    aiImprovedText.value = "AI가 글을 다듬고 있습니다...";

    const { data, error } = await supabase.functions.invoke("ai-polish", {
      body: {
        text: aiUserText.value,
        style: currentStyle,
        options: [],
        customPrompt: aiCustomPrompt?.value || "",
      },
    });

    if (error) {
      console.error(error);
      aiImprovedText.value = "AI 처리 중 오류가 발생했습니다.";
      return;
    }

    aiImprovedText.value = data?.result || "";
  };
}

/* ==========================================================================
   7. Apply AI Result
========================================================================== */
if (applyAiBtn) {
  applyAiBtn.onclick = () => {
    if (!aiImprovedText.value.trim()) {
      alert("적용할 AI 결과가 없습니다.");
      return;
    }

    desc.value = aiImprovedText.value;
    counter.innerText = `${desc.value.length} / 500`;
    aiModal.style.display = "none";
  };
}

/* ==========================================================================
   8. Submit (Issue Insert)
========================================================================== */
qs("writeForm").onsubmit = async (e) => {
  e.preventDefault();

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    alert("로그인이 필요합니다.");
    return;
  }

  const payload = {
    category: qs("category").value,
    title: qs("title").value.trim(),
    one_line: qs("oneLine").value.trim(),
    description: desc.value.trim(),
    user_id: sessionData.session.user.id,
    status: "normal",

    // 🔥 DB NOT NULL 안정화
    pro_count: 0,
    con_count: 0,
    sup_pro: 0,
    sup_con: 0,
  };

  if (!payload.category || !payload.title || !payload.one_line || !payload.description) {
    alert("필수 항목을 모두 입력해주세요.");
    return;
  }

  const { error } = await supabase.from("issues").insert(payload);

  if (error) {
    console.error(error);
    alert("갈라 발의 실패");
    return;
  }

  alert("갈라 발의 완료");
  location.href = "index.html";
};