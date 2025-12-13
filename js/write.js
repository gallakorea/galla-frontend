const $ = id => document.getElementById(id);

thumbnailBtn.onclick = () => thumbnail.click();
videoBtn.onclick = () => video.click();

thumbnail.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  thumbnailPreview.style.display = 'block';
  thumbnailPreview.querySelector('img').src = URL.createObjectURL(f);
};

video.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  videoPreview.style.display = 'block';
  const v = videoPreview.querySelector('video');
  v.src = URL.createObjectURL(f);
};

openAiModal.onclick = () => {
  aiModal.style.display = 'flex';
  aiUserText.value = description.value;
};
aiClose.onclick = () => aiModal.style.display = 'none';

runAi.onclick = () => {
  aiResultText.value = aiUserText.value + "\n\n[AI 개선본]";
};

applyAi.onclick = () => {
  description.value = aiResultText.value;
  aiModal.style.display = 'none';
};

writeForm.onsubmit = e => {
  e.preventDefault();
  alert("미리보기 단계입니다");
};