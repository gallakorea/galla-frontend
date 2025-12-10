document.addEventListener("DOMContentLoaded", () => {

  /***************************************************
   * 1) 썸네일 업로드
   ***************************************************/
  const thumbnailBtn = document.getElementById("thumbnailBtn");
  const thumbnailInput = document.getElementById("thumbnail");

  if (thumbnailBtn && thumbnailInput) {
    thumbnailBtn.addEventListener("click", () => thumbnailInput.click());
  }


  /***************************************************
   * 2) 영상 업로드 + 편집 모달
   ***************************************************/
  const videoModal = document.getElementById("videoModal");
  const openVideoEditor = document.getElementById("openVideoEditor");
  const videoInput = document.getElementById("videoInput");
  const editVideo = document.getElementById("editVideo");
  const closeVideoBtn = document.getElementById("videoCloseBtn");
  const brightness = document.getElementById("brightness");
  const volume = document.getElementById("volume");

  if (videoModal) videoModal.style.display = "none";

  /* 영상 업로드 버튼 → 파일 선택 */
  if (openVideoEditor && videoInput) {
    openVideoEditor.addEventListener("click", () => videoInput.click());
  }

  /* 파일 선택 시 → 모달 열림 + 프리뷰 로드 */
  if (videoInput && editVideo && videoModal) {
    videoInput.addEventListener("change", () => {
      if (!videoInput.files.length) return;

      const url = URL.createObjectURL(videoInput.files[0]);
      editVideo.src = url;

      // iOS / WebView 안정성을 위해 load() + play() 조합 필요
      editVideo.load();
      setTimeout(() => {
        editVideo.play().catch(() => {});
      }, 200);

      videoModal.style.display = "flex";
    });
  }

  /* 영상 모달 닫기 */
  if (closeVideoBtn && videoModal && editVideo) {
    closeVideoBtn.addEventListener("click", () => {
      videoModal.style.display = "none";
      editVideo.pause();
    });
  }

  /* 밝기 조절 */
  if (brightness && editVideo) {
    brightness.addEventListener("input", () => {
      editVideo.style.filter = `brightness(${brightness.value}%)`;
    });
  }

  /* 볼륨 조절 */
  if (volume && editVideo) {
    volume.addEventListener("input", () => {
      editVideo.volume = volume.value / 100;
    });
  }


  /***************************************************
   * 3) 설명 글자수 카운터
   ***************************************************/
  const desc = document.getElementById("description");
  const counter = document.querySelector(".desc-counter");

  if (desc && counter) {
    counter.textContent = `${desc.value.length} / 500`;

    desc.addEventListener("input", () => {
      counter.textContent = `${desc.value.length} / 500`;
    });
  }


  /***************************************************
   * 4) AI 도우미 모달
   ***************************************************/
  const aiModal = document.getElementById("aiModal");
  const openAi = document.getElementById("openAiModal");
  const closeAi = document.getElementById("aiCloseBtn");

  const aiUserText = document.getElementById("aiUserText");
  const aiImprovedText = document.getElementById("aiImprovedText");
  const aiTags = document.getElementById("aiTags");

  const aiStyleTabs = document.querySelectorAll(".ai-style-tabs button");
  const aiSummaryBtns = document.querySelectorAll(".ai-summary-options button");
  const applyAi = document.getElementById("applyAiText");

  let selectedStyle = "basic";
  let selectedOption = null;

  if (aiModal) aiModal.style.display = "none";

  /* AI 모달 열기 */
  if (openAi && aiModal) {
    openAi.addEventListener("click", () => {
      aiUserText.value = desc.value;
      aiImprovedText.value = "";
      generateAITags(desc.value);
      aiModal.style.display = "flex";
    });
  }

  /* AI 모달 닫기 */
  if (closeAi && aiModal) {
    closeAi.addEventListener("click", () => {
      aiModal.style.display = "none";
    });
  }


  /***************************************************
   * AI 태그 분석
   ***************************************************/
  function generateAITags(text) {
    aiTags.innerHTML = "";
    const tags = [];

    if (text.length > 200) tags.push("내용 풍부");
    if (text.includes("?")) tags.push("질문 포함");
    if (text.match(/[.!]/)) tags.push("문장 구조 안정적");
    if (text.length < 80) tags.push("짧은 글");

    if (tags.length === 0) tags.push("분석 불가");

    tags.forEach(t => {
      const tagEl = document.createElement("span");
      tagEl.classList.add("ai-tag");
      tagEl.textContent = t;
      aiTags.appendChild(tagEl);
    });
  }


  /***************************************************
   * AI 글 재작성 로직 (Dummy)
   ***************************************************/
  function aiRewrite(text, style = "basic", option = null) {
    let output = text.trim();

    const stylePresets = {
      basic: "핵심 내용을 재정리했습니다.\n\n",
      simple: "더 간결하게 다듬은 문장입니다.\n\n",
      power: "논리적 강도를 크게 올린 버전입니다.\n\n",
      emotional: "감정적 공감을 강화했습니다.\n\n",
      expert: "전문가 시점에서 재작성했습니다.\n\n",
      academic: "논문 구조로 정리했습니다.\n\n",
    };

    output = stylePresets[style] + output;

    if (option === "3line") {
      output = output.split(".").slice(0, 3).join(".") + " …";
    }

    if (option === "bullet") {
      const bullets = output.split(".").slice(0, 4);
      output = bullets.map(b => "• " + b.trim()).join("\n");
    }

    if (option === "counter") {
      output += "\n\n반대 의견도 존재합니다:\n- 다른 시각에서는 이렇게 해석될 수 있습니다…";
    }

    return output;
  }


  /***************************************************
   * 스타일 탭 클릭
   ***************************************************/
  aiStyleTabs.forEach(btn => {
    btn.addEventListener("click", () => {
      aiStyleTabs.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      selectedStyle = btn.dataset.style;
      aiImprovedText.value = aiRewrite(aiUserText.value, selectedStyle, selectedOption);
    });
  });

  /***************************************************
   * 요약 옵션 버튼
   ***************************************************/
  aiSummaryBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      selectedOption = btn.dataset.option;
      aiImprovedText.value = aiRewrite(aiUserText.value, selectedStyle, selectedOption);
    });
  });

  /***************************************************
   * AI 적용 버튼
   ***************************************************/
  if (applyAi) {
    applyAi.addEventListener("click", () => {
      desc.value = aiImprovedText.value;
      counter.textContent = `${desc.value.length} / 500`;
      aiModal.style.display = "none";
    });
  }


  /***************************************************
   * 5) 하단 네비 인디케이터
   ***************************************************/
  const navItems = document.querySelectorAll(".nav-item");

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      navItems.forEach(i => i.classList.remove("active"));
      item.classList.add("active");

      const color = item.dataset.color || "#4A6CFF";
      item.style.setProperty("--indicator-color", color);
    });
  });

});

videoInput?.addEventListener("change", () => {
  if (!videoInput.files.length) return;

  const file = videoInput.files[0];
  const url = URL.createObjectURL(file);

  editVideo.src = url;
  editVideo.load();

  editVideo.onloadedmetadata = () => {
    // 세로형 비율 9:16 강제 적용
    const naturalW = editVideo.videoWidth;
    const naturalH = editVideo.videoHeight;

    const targetRatio = 9 / 16;
    const videoRatio = naturalW / naturalH;

    // CSS 변환해서 세로형 화면에 맞춰서 보여줌
    if (videoRatio > targetRatio) {
      // 가로가 더 넓음 → 좌우 자르게 보임
      editVideo.style.width = "100%";
      editVideo.style.height = "auto";
    } else {
      // 세로 영상 → 상하 잘림
      editVideo.style.height = "100%";
      editVideo.style.width = "auto";
    }
  };

  videoModal.style.display = "flex";
});