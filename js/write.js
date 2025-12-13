const $ = id => document.getElementById(id);

/* counter */
const desc = $("description");
const counter = document.querySelector(".desc-counter");
desc.oninput = () => counter.textContent = `${desc.value.length} / 500`;

/* file buttons */
$("thumbnailBtn").onclick = () => $("thumbnail").click();
$("videoBtn").onclick = () => $("video").click();

/* preview */
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

/* AI modal */
$("openAiModal").onclick = () => {
  $("aiUserText").value = desc.value;
  $("aiModal").style.display = "flex";
};

$("aiClose").onclick = () => $("aiModal").style.display = "none";

$("runAi").onclick = () => {
  $("runAi").classList.add("active");
  $("aiResultText").value = $("aiUserText").value;
};

$("applyAi").onclick = () => {
  desc.value = $("aiResultText").value;
  counter.textContent = `${desc.value.length} / 500`;
  $("aiModal").style.display = "none";
};

/* submit */
$("writeForm").onsubmit = e => {
  e.preventDefault();
  alert("✅ 갈라 발의 UI 정상 작동");
};