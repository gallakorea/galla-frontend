console.log("[write.js] FULL SAFE MODE");

const $ = (id) => document.getElementById(id);

const desc = $("description");
const counter = document.querySelector(".desc-counter");

/* counter */
desc.addEventListener("input", () => {
  counter.textContent = `${desc.value.length} / 500`;
});

/* file buttons */
$("thumbnailBtn").onclick = () => $("thumbnail").click();
$("videoBtn").onclick = () => $("video").click();

/* bottom nav */
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.onclick = () => location.href = btn.dataset.target;
});

/* AI modal */
let currentStyle = "basic";

$("openAiModal").onclick = () => {
  $("aiUserText").value = desc.value;
  $("aiResultText").value = "";
  $("aiModal").style.display = "flex";
};

$("aiClose").onclick = () => {
  $("aiModal").style.display = "none";
};

document.querySelectorAll(".ai-style-tabs button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".ai-style-tabs button")
      .forEach(b => b.classList.remove("active"));
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
  desc.value = $("aiResultText").value;
  counter.textContent = `${desc.value.length} / 500`;
  $("aiModal").style.display = "none";
};

/* submit */
$("writeForm").onsubmit = (e) => {
  e.preventDefault();
  alert("✅ UI / 버튼 / 모달 전부 정상 작동");
};