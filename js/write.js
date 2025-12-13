const $ = id => document.getElementById(id);

/* =====================
   설명 글자수
===================== */
const desc = $("description");
const counter = document.querySelector(".desc-counter");

desc.addEventListener("input", () => {
  counter.textContent = `${desc.value.length} / 500`;
});

/* =====================
   파일 버튼
===================== */
$("thumbnailBtn").onclick = () => $("thumbnail").click();
$("videoBtn").onclick = () => $("video").click();

/* =====================
   미리보기
===================== */
$("thumbnail").onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const img = document.createElement("img");
  img.src = URL.createObjectURL(f);
  $("thumbPreview").innerHTML = "";
  $("thumbPreview").appendChild(img);
  $("thumbPreview").style.display = "block";
};

$("video").onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const v = document.createElement("video");
  v.src = URL.createObjectURL(f);
  v.controls = true;
  $("videoPreview").innerHTML = "";
  $("videoPreview").appendChild(v);
  $("videoPreview").style.display = "block";
};

/* =====================
   AI MODAL
===================== */
$("openAiModal").onclick = () => {
  $("aiUserText").value = desc.value;
  $("aiResultText").value = "";
  $("aiModal").style.display = "flex";
};

$("aiClose").onclick = () => {
  $("aiModal").style.display = "none";
};

$("runAi").onclick = () => {
  $("runAi").classList.add("active");
  $("aiResultText").value =
    `[AI 결과]\n` +
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

/* =====================
   제출
===================== */
$("writeForm").onsubmit = e => {
  e.preventDefault();
  alert("✅ 갈라 발의 UI 정상 작동");
};