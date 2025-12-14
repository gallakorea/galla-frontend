const form = document.getElementById('writeForm');
const previewArea = document.getElementById('previewArea');

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const data = {
    category: category.value,
    title: title.value,
    oneLine: oneLine.value,
    desc: description.value,
  };

  if (!data.category || !data.title || !data.desc) {
    alert('필수 항목을 입력하세요');
    return;
  }

  renderPreview(data);
});

function renderPreview(data) {
  previewArea.innerHTML = `
    <div class="preview-issue">
      <div class="preview-header">
        <div style="font-size:12px;color:#888">${data.category} · 방금 전</div>
        <h2>${data.title}</h2>
        <p>${data.oneLine}</p>
      </div>

      ${thumbPreview.innerHTML ? `
        <div class="preview-thumb">
          ${thumbPreview.innerHTML}
        </div>` : ''}

      <div class="preview-header">
        <p>${data.desc}</p>
      </div>

      <div class="preview-actions">
        <button class="btn-edit" id="backEdit">수정하기</button>
        <button class="btn-publish" id="publish">발행하기</button>
      </div>
    </div>
  `;

  document.getElementById('backEdit').onclick = () => {
    previewArea.innerHTML = '';
    previewArea.scrollIntoView({ behavior: 'smooth' });
  };

  document.getElementById('publish').onclick = () => {
    console.log('발행 데이터', data);
    alert('발행 처리 연결 예정');
  };
}