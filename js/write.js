console.log("[write.js] FULL STABLE");

const $ = id => document.getElementById(id);

const desc = $("description");
const counter = document.querySelector(".desc-counter");

/* counter */
desc.addEventListener("input", () => {
  counter.textContent = `${desc.value.length} / 500`;
});

/* thumbnail */
$("thumbnailBtn").addEventListener("click", () => $("thumbnail").click());
$("thumbnail").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  $("thumbnailPreview").src = URL.createObjectURL(file);
  $("thumbnailPreview").style.display = "block";
});

/* video */
$("videoBtn").addEventListener("click", () => $("video").click());
$("video").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  $("videoPreview").src = URL.createObjectURL(file);
  $("videoPreview").style.display = "block";
});

/* AI modal */
let style = "basic";
$("openAiModal").addEventListener("click", () => {
  $("aiUserText").value = desc.value;
  $("aiResultText").value = "";
  $("aiModal").style.display = "flex";
});

$("aiClose").addEventListener("click", () => {
  $("aiModal").style.display = "none";
});

document.querySelectorAll(".ai-style-tabs button").forEach(btn=>{
  btn.onclick = ()=>{
    document.querySelectorAll(".ai-style-tabs button").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    style = btn.dataset.style;
  };
});

$("runAi").onclick = ()=>{
  $("aiResultText").value =
    `[${style}]\n` +
    ($("aiCustomPrompt").value ? `요청: ${$("aiCustomPrompt").value}\n\n` : "") +
    $("aiUserText").value;
};

$("applyAi").onclick = ()=>{
  desc.value = $("aiResultText").value;
  counter.textContent = `${desc.value.length} / 500`;
  $("aiModal").style.display = "none";
};

/* submit */
$("writeForm").addEventListener("submit", e=>{
  e.preventDefault();
  alert("✅ UI / 버튼 / 업로드 / AI 전부 정상");
});

/* nav */
document.querySelectorAll(".nav-item").forEach(btn=>{
  btn.onclick = ()=>location.href = btn.dataset.target;
});