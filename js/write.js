console.log("[write.js] RUNNING");

/* util */
const $ = (id) => document.getElementById(id);

/* counter */
const desc = $("description");
const counter = document.querySelector(".desc-counter");

desc.addEventListener("input", () => {
  counter.textContent = `${desc.value.length} / 500`;
});

/* file buttons */
$("thumbnailBtn").onclick = () => $("thumbnail").click();
$("videoBtn").onclick = () => $("video").click();

/* thumbnail preview */
$("thumbnail").addEventListener("change", () => {
  const file = $("thumbnail").files[0];
  if (!file) return;

  const img = document.createElement("img");
  img.src = URL.createObjectURL(file);

  const wrap = $("thumbnailPreview");
  wrap.innerHTML = "";
  wrap.appendChild(img);
  wrap.style.display = "block";
});

/* video preview */
$("video").addEventListener("change", () => {
  const file = $("video").files[0];
  if (!file) return;

  const video = document.createElement("video");
  video.src = URL.createObjectURL(file);
  video.controls = true;
  video.muted = true;

  const wrap = $("videoPreview");
  wrap.innerHTML = "";
  wrap.appendChild(video);
  wrap.style.display = "block";
});

/* bottom nav */
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.onclick = () => location.href = btn.dataset.target;
});

/* submit */
$("writeForm").onsubmit = (e) => {
  e.preventDefault();
  alert("✅ UI / 버튼 / 업로드 미리보기 정상 작동");
};