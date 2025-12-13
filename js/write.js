console.log("[write.js] AI MODAL FINAL");

const $ = (id) => document.getElementById(id);

const desc = $("description");
const counter = document.querySelector(".desc-counter");

/* 글자수 */
desc.addEventListener("input", () => {
  counter.textContent = `${desc.value.length} / 500`;
});

/* 파일 버튼 */
$("thumbnailBtn").onclick = () => $("thumbnail").click();
$("videoBtn").onclick = () => $("video").click();

/* 하단 네비 */
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.onclick = () => location.href = btn.dataset.target;
});

/* AI MODAL */
let currentStyle = "basic";

$("openAiModal").onclick = () => {
  $("aiUserText").value = desc.value || "";
  $("aiResultText").value = "";
  $("aiModal").style.display = "flex";
};

$("aiClose").onclick = () => {
  $("aiModal").style.display = "none";
};

document.querySelectorAll(".ai-style-tabs button").forEach(btn => {
  btn.onclick = () => {
    document
      .querySelectorAll(".ai-style-tabs button")
      .forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentStyle = btn.dataset.style;
  };
});

/* AI 실행 (프론트 테스트용) */
$("runAi").onclick = () => {
  const custom = $("aiCustomPrompt").value;
  const base = $("aiUserText").value;

  $("aiResultText").value =
    `[${currentStyle}]\n` +
    (custom ? `요청: ${custom}\n\n` : "") +
    base;
};

/* 적용 */
$("applyAi").onclick = () => {
  if ($("aiResultText").value.trim()) {
    desc.value = $("aiResultText").value;
    counter.textContent = `${desc.value.length} / 500`;
  }
  $("aiModal").style.display = "none";
};

/* 제출 */
$("writeForm").onsubmit = (e) => {
  e.preventDefault();
  alert("✅ 모든 버튼 / UI 정상 작동");
};