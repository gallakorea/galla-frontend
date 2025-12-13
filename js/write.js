const $ = id => document.getElementById(id);

/* COUNTER */
$("description").addEventListener("input", e=>{
  document.querySelector(".desc-counter").textContent =
    `${e.target.value.length} / 500`;
});

/* FILE UPLOAD */
$("thumbnailBtn").onclick = ()=> $("thumbnail").click();
$("thumbnail").onchange = e=>{
  const img = $("thumbPreview").querySelector("img");
  img.src = URL.createObjectURL(e.target.files[0]);
  $("thumbPreview").style.display = "block";
};

$("videoBtn").onclick = ()=> $("video").click();
$("video").onchange = e=>{
  const v = $("videoPreview").querySelector("video");
  v.src = URL.createObjectURL(e.target.files[0]);
  $("videoPreview").style.display = "block";
};

/* AI MODAL */
$("openAiModal").onclick = ()=>{
  $("aiUserText").value = $("description").value;
  $("aiModal").classList.add("show");
};
$("aiClose").onclick = ()=> $("aiModal").classList.remove("show");

$("applyAi").onclick = ()=>{
  $("description").value = $("aiResultText").value;
  $("aiModal").classList.remove("show");
};

/* SUBMIT */
$("writeForm").onsubmit = e=>{
  e.preventDefault();
  alert("미리보기 단계 (다음 단계에서 실제 발의)");
};