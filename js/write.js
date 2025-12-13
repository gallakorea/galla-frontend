const $ = (id) => document.getElementById(id);

/* counter */
$("description").oninput = e => {
  document.querySelector(".desc-counter").innerText =
    `${e.target.value.length} / 500`;
};

/* thumbnail */
$("thumbnailBtn").onclick = () => $("thumbnail").click();
$("thumbnail").onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const img = $("thumbnailPreview").querySelector("img");
  img.src = URL.createObjectURL(f);
  $("thumbnailPreview").style.display = "block";
};

/* video */
$("videoBtn").onclick = () => $("video").click();
$("video").onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const v = $("videoPreview").querySelector("video");
  v.src = URL.createObjectURL(f);
  $("videoPreview").style.display = "block";
};

/* AI modal */
$("openAiModal").onclick = () => {
  $("aiUserText").value = $("description").value;
  $("aiModal").style.display = "flex";
};

$("aiClose").onclick = () => {
  $("aiModal").style.display = "none";
};

$("applyAi").onclick = () => {
  $("description").value = $("aiResultText").value;
  $("aiModal").style.display = "none";
};

/* submit */
$("writeForm").onsubmit = e => {
  e.preventDefault();
  alert("✅ 모든 UI 정상 작동");
};