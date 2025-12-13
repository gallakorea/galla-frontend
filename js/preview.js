import { supabase } from './supabase.js';

const data = JSON.parse(localStorage.getItem('galla_preview'));
if (!data) location.href = 'write.html';

const card = document.getElementById('previewCard');

card.innerHTML = `
  <div class="issue-card">
    ${data.thumbnailUrl ? `<img src="${data.thumbnailUrl}" />` : ''}
    <h2>${data.title}</h2>
    <p class="one-line">${data.oneLine}</p>
    <p class="desc">${data.description}</p>
    <span class="meta">
      ${data.isAnonymous ? '익명' : '작성자 표시'}
    </span>
  </div>
`;