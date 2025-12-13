console.log("[write.js] FULL SAFE MODE");

const $ = (id) => document.getElementById(id);

/* counter */
const desc = $("description");
const counter = document.querySelector(".desc-counter");
desc.oninput = () => counter.textContent = `${desc.value.length} / 500`;

/* nav */
document.querySelectorAll(".nav-item").forEach(btn=>{
  btn.onclick = ()=> location.href = btn.dataset.target;
});

/* thumbnail preview */
$("thumbnailBtn").onclick = ()=> $("thumbnail").click();
$("thumbnail").onchange = e=>{
  const file = e.target.files[0];
  if(file){
    const img = $("thumbPreview");
    img.src = URL.createObjectURL(file);
    img.style.display = "block";
  }
};

/* video preview */
$("videoBtn").onclick = ()=> $("video").click();
$("video").onchange = e=>{
  const file = e.target.files[0];
  if(file){
    const v = $("videoPreview");
    v.src = URL.createObjectURL(file);
    v.style.display = "block";
  }
};

/* AI modal */
let style = "basic";
$("openAiModal").onclick = ()=>{
  $("aiUserText").value = desc.value;
  $("aiResultText").value = "";
  $("aiModal").style.display = "flex";
};

$("aiClose").onclick = ()=> $("aiModal").style.display = "none";

document.querySelectorAll(".ai-style-tabs button").forEach(b=>{
  b.onclick = ()=>{
    document.querySelectorAll(".ai-style-tabs button").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    style = b.dataset.style;
  };
});

$("runAi").onclick = ()=>{
  $("aiResultText").value =
    `[${style}]\n` +
    ($("aiCustomPrompt").value ? "요청: "+$("aiCustomPrompt").value+"\n\n" : "") +
    $("aiUserText").value;
};

$("applyAi").onclick = ()=>{
  desc.value = $("aiResultText").value;
  counter.textContent = `${desc.value.length} / 500`;
  $("aiModal").style.display = "none";
};

/* submit */
$("writeForm").onsubmit = e=>{
  e.preventDefault();
  alert("✅ 발의 완료 (UI/JS 정상)");
};