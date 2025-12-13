console.log("[write.js] FULL STABLE");

const $ = id => document.getElementById(id);

const desc = $("description");
const counter = document.querySelector(".desc-counter");

/* counter */
desc.addEventListener("input", () => {
  counter.textContent = `${desc.value.length} / 500`;
});

/* file buttons */
$("thumbnailBtn").onclick = () => $("thumbnail").click();
$("videoBtn").onclick = () => $("video").click();

/* nav */
document.querySelectorAll(".nav-item").forEach(b=>{
  b.onclick = ()=>location.href=b.dataset.target;
});

/* AI modal */
const aiModal = $("aiModal");
$("openAiModal").onclick = ()=>{
  $("aiUserText").value = desc.value;
  $("aiResultText").value = "";
  aiModal.style.display="flex";
};
$("aiClose").onclick = ()=> aiModal.style.display="none";

/* style tabs */
let currentStyle="basic";
document.querySelectorAll(".ai-style-tabs button").forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll(".ai-style-tabs button").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    currentStyle=btn.dataset.style;
  };
});

/* run AI (mock safe) */
$("runAi").onclick=()=>{
  const prompt=$("aiCustomPrompt").value;
  $("aiResultText").value =
    `[${currentStyle}]\n` +
    (prompt?`요청: ${prompt}\n\n`:"") +
    $("aiUserText").value;
};

/* apply */
$("applyAi").onclick=()=>{
  if($("aiResultText").value){
    desc.value=$("aiResultText").value;
    counter.textContent=`${desc.value.length} / 500`;
  }
  aiModal.style.display="none";
};

/* submit */
$("writeForm").onsubmit=e=>{
  e.preventDefault();
  alert("✅ 발의 버튼 정상 작동");
};