console.log("[write.js] stable loaded");

const qs = id => document.getElementById(id);
const supabase = window.supabaseClient;

/* ===== Auth ===== */
(async () => {
  const { data } = await supabase.auth.getSession();
  if (!data.session) location.href = "login.html";
})();

/* ===== Counter ===== */
const desc = qs("description");
const counter = document.querySelector(".desc-counter");
desc.oninput = () =>
  counter.innerText = `${desc.value.length} / 500`;

/* ===== Thumbnail ===== */
let thumbnailFile = null;
qs("thumbnailBtn").onclick = () => qs("thumbnail").click();
qs("thumbnail").onchange = e => {
  thumbnailFile = e.target.files[0];
  qs("thumbnailBtn").innerText = "선택됨";
};

/* ===== AI MODAL ===== */
const aiModal = qs("aiModal");
let aiStyle = "basic";

qs("openAiModal").onclick = () => {
  qs("aiUserText").value = desc.value;
  qs("aiResultText").value = "";
  aiModal.style.display = "block";
};

qs("aiClose").onclick = () => aiModal.style.display = "none";

document.querySelectorAll(".ai-style-tabs button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".ai-style-tabs button")
      .forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    aiStyle = btn.dataset.style;
  };
});

/* ===== AI 실행 ===== */
qs("runAi").onclick = async () => {
  const { data, error } = await supabase.functions.invoke("ai-polish", {
    body: {
      text: qs("aiUserText").value,
      style: aiStyle,
      custom: qs("aiCustomPrompt").value
    }
  });

  if (error) {
    qs("aiResultText").value = "AI 오류";
    return;
  }

  qs("aiResultText").value = data.result;
};

qs("applyAi").onclick = () => {
  desc.value = qs("aiResultText").value;
  counter.innerText = `${desc.value.length} / 500`;
  aiModal.style.display = "none";
};

/* ===== Submit ===== */
qs("writeForm").onsubmit = async e => {
  e.preventDefault();

  const { data } = await supabase.auth.getSession();
  const user = data.session.user;

  const thumbPath = `thumbnails/${user.id}_${Date.now()}.jpg`;
  await supabase.storage.from("issues").upload(thumbPath, thumbnailFile);

  await supabase.from("issues").insert({
    category: qs("category").value,
    title: qs("title").value,
    one_line: qs("oneLine").value,
    description: desc.value,
    thumbnail_url: thumbPath,
    user_id: user.id,
    status: "normal"
  });

  location.href = "index.html";
};