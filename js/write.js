const previewArea = document.getElementById('previewArea');

const thumbnailInput = document.getElementById('thumbnail');
const videoInput = document.getElementById('video');

let thumbURL = '';
let videoURL = '';

document.getElementById('thumbnailBtn').onclick = () => thumbnailInput.click();
document.getElementById('videoBtn').onclick = () => videoInput.click();

thumbnailInput.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  thumbURL = URL.createObjectURL(f);
};

videoInput.onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  videoURL = URL.createObjectURL(f);
};

document.getElementById('previewBtn').onclick = () => {
  const category = document.getElementById('category').value;
  const title = document.getElementById('title').value;
  const oneLine = document.getElementById('oneLine').value;
  const desc = document.getElementById('description').value;
  const anon = document.getElementById('isAnonymous').checked;

  if (!category || !title || !desc) {
    alert('카테고리, 제목, 이슈 설명은 필수입니다.');
    return;
  }

  previewArea.innerHTML = `
    <div style="background:#111;border:1px solid #222;border-radius:16px;padding:16px;">
      <div style="font-size:12px;color:#aaa;margin-bottom:6px;">
        ${category} · 방금 전
      </div>

      <h2 style="font-size:18px;font-weight:800;margin-bottom:6px;">
        ${title}
      </h2>

      <div style="font-size:14px;color:#ccc;margin-bottom:10px;">
        ${oneLine || ''}
      </div>

      ${thumbURL ? `<img src="${thumbURL}" style="width:100%;border-radius:12px;margin-bottom:12px;">` : ''}

      ${videoURL ? `
        <video src="${videoURL}" controls style="width:100%;border-radius:12px;margin-bottom:12px;"></video>
      ` : ''}

      <div style="font-size:14px;line-height:1.6;margin-bottom:12px;">
        ${desc}
      </div>

      <div style="font-size:13px;color:#888;">
        작성자 · ${anon ? '익명' : '본인'}
      </div>

      <button style="
        width:100%;
        margin-top:14px;
        padding:14px;
        background:#2f80ff;
        border:none;
        border-radius:999px;
        color:#fff;
        font-weight:800;
        font-size:15px;
      ">
        이대로 발행하기
      </button>
    </div>
  `;

  previewArea.scrollIntoView({ behavior: 'smooth' });
};