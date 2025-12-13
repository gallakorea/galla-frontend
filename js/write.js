console.log("[write.js] FULL WORKING MODE");

const $ = (id) => document.getElementById(id);

const desc = $("description");
const counter = document.querySelector(".desc-counter");

/* counter */
desc.addEventListener("input", () => {
  counter.textContent = `${desc.value.length} / 500`;
});

/* thumbnail */
$("thumbnailBtn").onclick = () => $("thumbnail").click();
$("thumbnail").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $("thumbPreview").src = URL.createObjectURL(file);
  $("thumbPreview").style.display = "block";
};

/* video */
$("videoBtn").onclick = () => $("video").click();
$("video").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $("videoPreview").src = URL.createObjectURL(file);
  $("videoPreview").style.display = "block";
};

/* AI modal */
$("openAiModal").onclick = () => {
  $("aiUserText").value = desc.value;
  $("aiResultText").value = "";
  $("aiModal").style.display = "flex";
};

$("aiClose").onclick = () => {
  $("aiModal").style.display = "none";
};

let currentStyle = "basic";
document.querySelectorAll(".ai-style-tabs button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".ai-style-tabs button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentStyle = btn.dataset.style;
  };
});

$("runAi").onclick = () => {
  $("aiResultText").value =
    `[${currentStyle}]\n` +
    ($("aiCustomPrompt").value ? `요청: ${$("aiCustomPrompt").value}\n\n` : "") +
    $("aiUserText").value;
};

$("applyAi").onclick = () => {
  if ($("aiResultText").value.trim()) {
    desc.value = $("aiResultText").value;
    counter.textContent = `${desc.value.length} / 500`;
  }
  $("aiModal").style.display = "none";
};

/* submit */
$("writeForm").onsubmit = (e) => {
  e.preventDefault();
  alert("✅ 발의 UI / 버튼 / 미리보기 정상 작동");
};

/* nav */
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.onclick = () => location.href = btn.dataset.target;
});