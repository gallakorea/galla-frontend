const commentList = document.getElementById("commentList");

/*
comment = {
  id,
  parent_id: null | id,
  depth,
  nickname,
  body
}
*/

const comments = []; // Supabase에서 가져온다고 가정

function renderComments(list, parentId = null, depth = 0) {
  list
    .filter(c => c.parent_id === parentId)
    .forEach(c => {
      const li = document.createElement("li");
      li.className = `comment depth-${depth}`;
      li.innerHTML = `
        <div class="comment-meta">${c.nickname}</div>
        <div class="comment-body">${c.body}</div>
        <div class="comment-actions">
          <button>👍</button>
          <button>👎</button>
          <button onclick="replyTo(${c.id})">답글</button>
        </div>
      `;
      commentList.appendChild(li);

      renderComments(list, c.id, depth + 1);
    });
}

function replyTo(parentId) {
  const body = prompt("답글을 입력하세요");
  if (!body) return;

  comments.push({
    id: Date.now(),
    parent_id: parentId,
    depth: 0,
    nickname: generateAnonNickname(),
    body
  });

  commentList.innerHTML = "";
  renderComments(comments);
}

function generateAnonNickname() {
  const a = ["웃픈", "화난", "졸린", "과몰입한"];
  const b = ["감자", "고양이", "직장인", "유령"];
  return `${a[Math.floor(Math.random()*a.length)]} ${b[Math.floor(Math.random()*b.length)]}`;
}