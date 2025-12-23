export function loadFactionComments() {

  const dummy = {
    pro: {
      billboard: [
        { text: "이 정책은 장기적으로 필요합니다.", likes: 1203 },
        { text: "지금이 아니면 기회가 없습니다.", likes: 842 },
        { text: "현실적인 대안입니다.", likes: 611 }
      ],
      comments: [
        { text: "전체적으로 동의합니다.", likes: 52 },
        { text: "지금은 밀어야 할 때입니다.", likes: 31 }
      ]
    },
    con: {
      billboard: [
        { text: "사회적 비용이 너무 큽니다.", likes: 1203 },
        { text: "졸속 추진입니다.", likes: 842 },
        { text: "검증이 전혀 없습니다.", likes: 611 }
      ],
      comments: [
        { text: "근본적으로 위험합니다.", likes: 94 },
        { text: "다시 논의해야 합니다.", likes: 41 }
      ]
    }
  };

  renderFaction("pro", dummy.pro);
  renderFaction("con", dummy.con);
}

function renderFaction(type, data) {
  const bb = document.getElementById(`billboard-${type}`);
  const list = document.getElementById(`comments-${type}`);

  bb.innerHTML = "";
  list.innerHTML = "";

  data.billboard.forEach(c => {
    bb.innerHTML += `
      <div class="comment">
        <div class="comment-body">${c.text}</div>
        <div class="comment-actions">❤️ ${c.likes}</div>
      </div>`;
  });

  data.comments.forEach(c => {
    list.innerHTML += `
      <div class="comment">
        <div class="comment-body">${c.text}</div>
        <div class="comment-actions">❤️ ${c.likes} · ⚔️ 도전</div>
      </div>`;
  });
}