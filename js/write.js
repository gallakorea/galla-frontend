const $ = id => document.getElementById(id);

/* 카운터 */
$("description").addEventListener("input", e=>{
  document.querySelector(".desc-counter").innerText =
    `${e.target.value.length} / 500`;
});

/* 썸네일 */
$("thumbnailBtn").onclick = ()=> $("thumbnail").click();
$("thumbnail").onchange = e=>{
  const img = $("thumbPreview").querySelector("img");
  img.src = URL.createObjectURL(e.target.files[0]);
  $("thumbPreview").style.display="block";
};

/* 영상 */
$("videoBtn").onclick = ()=> $("video").click();
$("video").onchange = e=>{
  const v = $("videoPreview").querySelector("video");
  v.src = URL.createObjectURL(e.target.files[0]);
  v.play();
  $("videoPreview").style.display="block";
};

/* AI 모달 */
$("openAiModal").onclick = ()=>{
  $("aiUserText").value = $("description").value;
  $("aiModal").style.display="flex";
};
$("aiClose").onclick = ()=> $("aiModal").style.display="none";

$("runAi").onclick = ()=>{
  $("aiResultText").value =
    `[AI 결과]\n` +
    ($("aiPrompt").value ? `요청: ${$("aiPrompt").value}\n\n` : "") +
    $("aiUserText").value;
};

$("applyAi").onclick = ()=>{
  $("description").value = $("aiResultText").value;
  $("aiModal").style.display="none";
};