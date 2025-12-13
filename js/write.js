document.addEventListener("DOMContentLoaded", () => {

  const desc = document.getElementById("description");
  const counter = document.querySelector(".desc-counter");

  desc.addEventListener("input", () => {
    counter.textContent = `${desc.value.length} / 500`;
  });

  document.getElementById("thumbnailBtn").onclick = () =>
    document.getElementById("thumbnail").click();

  document.getElementById("videoBtn").onclick = () =>
    document.getElementById("video").click();

  const aiModal = document.getElementById("aiModal");

  document.getElementById("openAiModal").onclick = () => {
    document.getElementById("aiUserText").value = desc.value;
    aiModal.style.display = "flex";
  };

  document.getElementById("aiClose").onclick = () => {
    aiModal.style.display = "none";
  };

  document.getElementById("applyAi").onclick = () => {
    desc.value = document.getElementById("aiResultText").value;
    counter.textContent = `${desc.value.length} / 500`;
    aiModal.style.display = "none";
  };

  document.getElementById("writeForm").onsubmit = (e) => {
    e.preventDefault();
    alert("✅ 발의 버튼 정상 작동");
  };

});