<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>새 갈라 만들기 - GALLA</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- CSS -->
  <link rel="stylesheet" href="./css/write.css" />

  <style>
    body {
      background:#000;
      color:#fff;
      font-family: system-ui, -apple-system, BlinkMacSystemFont;
    }

    .page-inner {
      max-width: 520px;
      margin: 0 auto;
      padding: 24px 16px 120px;
    }

    .field-block { margin-bottom: 18px; }
    .field-label { font-size: 14px; margin-bottom: 6px; display:block; }

    .input-field, select, textarea, button {
      width:100%;
      padding:14px;
      border-radius:12px;
      background:#111;
      border:1px solid #222;
      color:#fff;
      font-size:15px;
    }

    textarea { min-height:120px; resize:none; }

    .primary-btn {
      background:#2f80ff;
      border:none;
      font-size:16px;
      font-weight:600;
    }

    .file-btn { text-align:center; cursor:pointer; }

    .desc-counter {
      font-size:12px;
      opacity:.6;
      float:right;
    }

    /* AI MODAL */
    .ai-modal {
      display:none;
      position:fixed;
      inset:0;
      background:rgba(0,0,0,.75);
      z-index:999;
      align-items:center;
      justify-content:center;
    }

    .ai-box {
      width:90%;
      max-width:520px;
      background:#0f0f0f;
      border-radius:16px;
      padding:16px;
    }

    .ai-header {
      display:flex;
      justify-content:space-between;
      align-items:center;
      margin-bottom:12px;
    }

    .ai-tabs button {
      margin-right:6px;
      padding:6px 10px;
      border-radius:8px;
      border:1px solid #333;
      background:#111;
      color:#fff;
      font-size:13px;
    }

    .ai-tabs button.active {
      background:#2f80ff;
      border:none;
    }

    .ai-textarea {
      width:100%;
      min-height:80px;
      margin-top:8px;
    }
  </style>
</head>

<body>

<div class="page-inner">

  <h1>새 갈라치기 만들기</h1>
  <p style="opacity:.7">사람들의 찬반과 후원을 모아보세요.</p>

  <form id="writeForm">

    <!-- CATEGORY -->
    <div class="field-block">
      <label class="field-label">카테고리 (필수)</label>
      <select id="category" required>
        <option value="">선택</option>
        <option>정치·사회</option>
        <option>경제·투자</option>
        <option>직장·경력</option>
        <option>연애·결혼</option>
        <option>생활·일상</option>
        <option>패션·뷰티</option>
        <option>엔터·스포츠</option>
        <option>세계·여행</option>
        <option>음식·맛집</option>
        <option>19금</option>
        <option>기타</option>
      </select>
    </div>

    <!-- TITLE -->
    <div class="field-block">
      <label class="field-label">제목 (필수)</label>
      <input id="title" class="input-field" required />
    </div>

    <!-- ONE LINE -->
    <div class="field-block">
      <label class="field-label">발의자 한 줄 (필수)</label>
      <input id="oneLine" class="input-field" required />
    </div>

    <!-- THUMBNAIL -->
    <div class="field-block">
      <label class="field-label">썸네일 (필수)</label>
      <input type="file" id="thumbnail" hidden accept="image/*" />
      <button type="button" id="thumbnailBtn" class="file-btn input-field">
        이미지 업로드
      </button>
    </div>

    <!-- VIDEO -->
    <div class="field-block">
      <label class="field-label">1분 엘리베이터 스피치 (선택)</label>
      <input type="file" id="video" hidden accept="video/*" />
      <button type="button" id="videoBtn" class="file-btn input-field">
        영상 업로드
      </button>
    </div>

    <!-- DESCRIPTION -->
    <div class="field-block">
      <label class="field-label">
        이슈 설명 (필수)
        <span class="desc-counter">0 / 500</span>
      </label>
      <textarea id="description" maxlength="500" required></textarea>
      <button type="button" id="openAiModal" class="file-btn" style="margin-top:8px">
        ✨ AI 글 다듬기
      </button>
    </div>

    <button class="primary-btn" type="submit">갈라 발의하기</button>
  </form>
</div>

<!-- AI MODAL -->
<div id="aiModal" class="ai-modal">
  <div class="ai-box">
    <div class="ai-header">
      <strong>AI 글 다듬기</strong>
      <button id="aiClose">✕</button>
    </div>

    <div class="ai-tabs">
      <button data-style="basic" class="active">기본</button>
      <button data-style="simple">간결</button>
      <button data-style="strong">강렬</button>
      <button data-style="emotional">감성</button>
      <button data-style="expert">전문가</button>
    </div>

    <textarea id="aiUserText" class="ai-textarea" placeholder="내가 쓴 글"></textarea>
    <textarea id="aiResultText" class="ai-textarea" placeholder="AI 결과"></textarea>

    <button id="applyAi" class="primary-btn" style="margin-top:10px">적용</button>
  </div>
</div>

<!-- JS -->
<script>
  const qs = (id) => document.getElementById(id);

  const desc = qs("description");
  const counter = document.querySelector(".desc-counter");

  desc.addEventListener("input", () => {
    counter.innerText = desc.value.length + " / 500";
  });

  qs("thumbnailBtn").onclick = () => qs("thumbnail").click();
  qs("videoBtn").onclick = () => qs("video").click();

  // AI MODAL (UI ONLY)
  qs("openAiModal").onclick = () => {
    qs("aiUserText").value = desc.value;
    qs("aiModal").style.display = "flex";
  };

  qs("aiClose").onclick = () => {
    qs("aiModal").style.display = "none";
  };

  qs("applyAi").onclick = () => {
    desc.value = qs("aiResultText").value;
    counter.innerText = desc.value.length + " / 500";
    qs("aiModal").style.display = "none";
  };

  // SUBMIT (NO UPLOAD / NO AI / DB ONLY – 안정화용)
  qs("writeForm").onsubmit = (e) => {
    e.preventDefault();
    alert("UI 안정화 완료 상태. 다음 단계에서 업로드/AI 연결 진행");
  };
</script>

</body>
</html>