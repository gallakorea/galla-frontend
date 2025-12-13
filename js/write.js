console.log("[write.js] SAFE MODE");

const $ = (id) => document.getElementById(id);

const desc = $("description");
const counter = document.querySelector(".desc-counter");

/* 카운터 */
desc.addEventListener("input", () => {
  counter.textContent = `${desc.value.length} / 500`;
});

/* 파일 버튼 */
$("thumbnailBtn").onclick = () => $("thumbnail").click();
$("videoBtn").onclick = () => $("video").click();

/* AI 모달 */
$("openAiModal").onclick = () => {
  $("aiUserText").value = desc.value;
  $("aiResultText").value = "";
  $("aiModal").style.display = "flex";
};

$("aiClose").onclick = () => {
  $("aiModal").style.display = "none";
};

$("applyAi").onclick = () => {
  desc.value = $("aiResultText").value;
  counter.textContent = `${desc.value.length} / 500`;
  $("aiModal").style.display = "none";
};

/* 하단 네비 */
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.onclick = () => location.href = btn.dataset.target;
});

/* 제출 */
$("writeForm").onsubmit = (e) => {
  e.preventDefault();
  alert("✅ UI / 버튼 / 레이아웃 정상 작동 상태");
};