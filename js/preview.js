const data = JSON.parse(sessionStorage.getItem('previewData'));
if (!data) location.href = 'write.html';

document.getElementById('preview').innerHTML = `
  <section class="section-block">
    <h1>${data.title}</h1>
    <p>${data.oneLine || ''}</p>
  </section>

  ${data.thumbURL ? `<img src="${data.thumbURL}" style="width:100%">` : ''}

  ${data.videoURL ? `<video src="${data.videoURL}" controls style="width:100%"></video>` : ''}

  <section class="section-block">
    <h3>이슈 설명</h3>
    <p>${data.description}</p>
  </section>

  <div class="field-block">
    <button class="primary-btn" onclick="location.href='write.html'">수정하기</button>
  </div>
`;