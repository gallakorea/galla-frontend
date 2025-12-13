const $ = id => document.getElementById(id);

$("thumbnailBtn").onclick = () => $("thumbnail").click();
$("videoBtn").onclick = () => $("video").click();

$("thumbnail").onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  $("thumbPreview").src = URL.createObjectURL(file);
  $("thumbPreview").style.display = "block";
};

$("video").onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  $("videoPreview").src = URL.createObjectURL(file);
  $("videoPreview").style.display = "block";
};

$("description").oninput = e => {
  document.querySelector(".desc-counter").innerText =
    `${e.target.value.length} / 500`;
};

$("openAiModal").onclick = () => {
  $("aiUserText").value = $("description").value;
  $("aiModal").style.display = "flex";
};

$("aiClose").onclick = () => $("aiModal").style.display = "none";

$("runAi").onclick = () => {
  $("aiResultText").value = "[AI 결과 예시]\n" + $("aiUserText").value;
};

$("applyAi").onclick = () => {
  $("description").value = $("aiResultText").value;
  $("aiModal").style.display = "none";
};