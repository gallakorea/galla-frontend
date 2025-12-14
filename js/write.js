// AI MODAL
const aiModal = document.getElementById("aiModal");
document.getElementById("openAi").onclick = () => aiModal.style.display = "flex";
document.getElementById("closeAi").onclick = () => aiModal.style.display = "none";

// PREVIEW
document.getElementById("openPreview").onclick = () => {
  alert("미리보기는 issue UI와 동일하게 렌더링됩니다.");
};

// THUMB PREVIEW
document.getElementById("thumbInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const img = document.createElement("img");
  img.src = URL.createObjectURL(file);
  img.style.width = "100%";
  img.style.borderRadius = "12px";
  const box = document.getElementById("thumbPreview");
  box.innerHTML = "";
  box.appendChild(img);
});

// VIDEO MODAL
document.querySelectorAll(".speech-btn").forEach(btn => {
  btn.onclick = () => {
    document.getElementById("videoModal").style.display = "flex";
  };
});
document.getElementById("closeVideo").onclick = () => {
  document.getElementById("videoModal").style.display = "none";
};