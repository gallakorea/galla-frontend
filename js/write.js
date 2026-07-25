document.addEventListener('DOMContentLoaded', () => {
  // 🚨 WRITE PAGE ENTRY RESET — draft / check state hard clear
  sessionStorage.removeItem('__CURRENT_DRAFT_ID__');
  sessionStorage.removeItem('__DRAFT_CHECK_ONLY__');
  sessionStorage.removeItem('__ALLOW_DRAFT_EXIT__');
  sessionStorage.removeItem('__DRAFT_THUMBNAIL_URL__');
  sessionStorage.removeItem('__DRAFT_VIDEO_URL__');
  const body = document.body;

  const form = document.getElementById('writeForm');
  const issuePreview = document.getElementById('issuePreview');

  const categoryEl = document.getElementById('category');
  const titleEl = document.getElementById('title');
  const oneLineEl = document.getElementById('oneLine');
  const descEl = document.getElementById('description');
  const donationEl = document.getElementById('donationTarget'); // ✅ 추가
  const authorStanceEls = document.querySelectorAll(
  'input[name="authorStance"]'
);

  /* ✍️ 텍스트 자동 임시저장(공용 draft 모듈) — 실수로 나가도 제목·요약·카테고리·진영이
     살아남고, 재진입 시 복원 + '이어서 작성 중' 안내. (미디어는 blob이라 재첨부 필요)
     발행 성공 시 confirm.js가 galla_draft_write 를 비운다. */
  const __wd = window.GALLA_draft &&
    window.GALLA_draft('write', ['category', 'title', 'oneLine', 'description', 'factionA', 'factionB']);
  if (__wd) __wd.restore();
  window.clearTextDraft = () => { __wd && __wd.clear(); };

  /* 🎬 핫영상 → '이걸로 갈라'로 넘어온 경우 제목·본문 미리 채우기.
     (유튜브 영상은 우리가 호스팅하지 않으므로 미디어는 직접 올려야 한다) */
  try {
    const seed = JSON.parse(sessionStorage.getItem('GALLA_SEED') || 'null');
    if (seed && seed.url) {
      sessionStorage.removeItem('GALLA_SEED');
      if (titleEl && !titleEl.value) titleEl.value = seed.title || '';
      if (descEl && !descEl.value) {
        descEl.value = '이 영상을 두고 의견이 갈립니다.\n\n출처: ' + (seed.source || '유튜브') + '\n' + seed.url;
      }
    }
  } catch (_) {}

  /* ================= FILE ================= */
  const thumbInput = document.getElementById('thumbnail');
  const thumbBtn = document.getElementById('thumbnailBtn');
  const thumbPreview = document.getElementById('thumbPreview');

  // 대표 썸네일(3:4, 마이페이지 카드용 · 선택)
  const cardThumbInput = document.getElementById('cardThumb');
  const cardThumbLabel = document.getElementById('cardThumbLabel');
  const cardThumbPreview = document.getElementById('cardThumbPreview');
  const cardThumbImg = document.getElementById('cardThumbImg');
  const cardThumbClear = document.getElementById('cardThumbClear');
  if (cardThumbInput) {
    cardThumbInput.addEventListener('change', () => {
      const f = cardThumbInput.files && cardThumbInput.files[0];
      if (!f) return;
      cardThumbImg.src = URL.createObjectURL(f);
      cardThumbPreview.hidden = false;
      cardThumbLabel.hidden = true;
    });
    cardThumbClear.addEventListener('click', () => {
      cardThumbInput.value = '';
      cardThumbPreview.hidden = true;
      cardThumbLabel.hidden = false;
    });
  }

  const MAX_IMAGES = 10;

  // 업로드에 쓸 최종 이미지(4:5로 크롭 완료된 File 배열). 원본 대신 이걸 올린다.
  let croppedImages = [];

  // 선택된 사진 미리보기 렌더 — 각 장 삭제(✕) + 마지막에 추가(＋) 타일
  function renderThumbs() {
    if (!croppedImages.length) {
      thumbPreview.innerHTML = '';
      // 드롭존을 다시 보이게
      if (thumbBtn) thumbBtn.style.display = '';
      return;
    }
    // 사진이 있으면 큰 드롭존은 감추고, 스트립 안 '추가' 타일로 대체
    if (thumbBtn) thumbBtn.style.display = 'none';
    thumbPreview.innerHTML = `
      <div class="multi-img-strip">
        ${croppedImages.map((f, i) => `
          <div class="multi-img-item">
            <img src="${URL.createObjectURL(f)}">
            ${i === 0 ? '<span class="multi-img-badge">대표</span>' : ''}
            <button type="button" class="multi-img-del" data-idx="${i}" aria-label="삭제">✕</button>
          </div>
        `).join('')}
        ${croppedImages.length < MAX_IMAGES
          ? `<button type="button" class="multi-img-add" id="thumbAddMore" aria-label="사진 추가">＋</button>`
          : ''}
      </div>
      <div class="guide-text">${croppedImages.length}/${MAX_IMAGES}장 · 첫 장이 대표${croppedImages.length > 1 ? ' · 캐러셀로 노출' : ''}</div>
    `;
  }

  async function addFiles(files) {
    files = [...(files || [])].filter(Boolean);
    if (!files.length) return;
    const room = MAX_IMAGES - croppedImages.length;
    if (room <= 0) { alert(`이미지는 최대 ${MAX_IMAGES}장까지 올릴 수 있습니다.`); return; }
    if (files.length > room) {
      alert(`${room}장만 더 추가할 수 있어 처음 ${room}장만 담았습니다.`);
      files = files.slice(0, room);
    }
    const prev = thumbPreview.innerHTML;
    thumbPreview.insertAdjacentHTML('afterbegin', `<div class="guide-text" id="thumbProc">사진 처리 중…</div>`);
    let processed;
    try {
      processed = typeof window.GALLA_PROCESS_IMAGES === 'function'
        ? await window.GALLA_PROCESS_IMAGES(files)
        : files;
    } catch (err) {
      console.error('[CROP ERROR]', err);
      processed = files;
    }
    croppedImages = croppedImages.concat(processed);   // 기존에 이어붙이기(교체 아님)
    renderThumbs();
  }

  // label[for] 이 네이티브로 파일창을 염. 재선택 위해 열릴 때 value 초기화.
  thumbInput.addEventListener('click', () => { thumbInput.value = ''; });
  thumbInput.addEventListener('change', e => { addFiles(e.target.files); });

  // 스트립 내 삭제(✕) / 추가(＋) 위임
  thumbPreview.addEventListener('click', e => {
    const del = e.target.closest('.multi-img-del');
    if (del) {
      croppedImages.splice(Number(del.dataset.idx), 1);
      renderThumbs();
      return;
    }
    if (e.target.closest('.multi-img-add')) {
      thumbInput.value = '';
      thumbInput.click();
    }
  });

  const videoInput = document.getElementById('video');
  const videoBtn = document.getElementById('videoBtn');
  const videoPreview = document.getElementById('videoPreview');

  /* label[for=video] 이 파일창을 염. 재선택 위해 열릴 때 value 초기화 */
  videoInput.addEventListener('click', () => { videoInput.value = ''; });

  /* 🔥 영상 미리보기 안정화 */
  videoInput.addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;

    videoPreview.innerHTML = '';

    const video = document.createElement('video');
    video.src = URL.createObjectURL(f);
    video.muted = true;
    video.controls = true;
    video.playsInline = true;

    video.load();
    videoPreview.appendChild(video);

    // 🚀 고르는 즉시 배경 업로드 시작 — 제목·진영을 입력하는 동안 전송이 끝나 있게.
    //    발행 버튼을 누른 뒤에 올리면 그 시간을 사용자가 고스란히 기다린다.
    if (!window.GALLA_bgVideo) return;
    const bar = ensureVideoBar();
    const r = await window.GALLA_bgVideo.pick(f);
    if (!r.ok) {
      // 길이 초과는 여기서 잡아야 한다 — 발행 때 실패시키면 그때까지 쓴 글이 헛수고가 된다
      const msg = r.reason === 'too_long'
        ? `영상이 너무 길어요 (${r.duration}초) — 최대 ${r.max}초까지 올릴 수 있어요.`
        : r.reason === 'too_large' ? '영상 파일이 너무 커요.' : '영상을 읽지 못했어요.';
      bar.textContent = '⚠️ ' + msg;
      bar.className = 'vup-bar err';
      videoInput.value = '';
      videoPreview.innerHTML = '';
      return;
    }
    bar.className = 'vup-bar';
    const tick = setInterval(() => {
      const p = window.GALLA_bgVideo.progress();
      bar.textContent = window.GALLA_bgVideo.isDone()
        ? '✅ 영상 준비 완료 — 바로 발행할 수 있어요'
        : `⬆️ 영상 미리 올리는 중… ${p}% (글을 계속 쓰셔도 됩니다)`;
      if (window.GALLA_bgVideo.isDone()) clearInterval(tick);
    }, 400);
  });

  // 업로드 상태 줄 — 미리보기 바로 아래
  function ensureVideoBar() {
    let b = document.getElementById('vupBar');
    if (!b) {
      b = document.createElement('div');
      b.id = 'vupBar';
      b.className = 'vup-bar';
      videoPreview.insertAdjacentElement('afterend', b);
    }
    b.textContent = '⬆️ 영상 미리 올리는 중… 0%';
    return b;
  }

  /* ================= 진영 이름 → 입장 라벨 연동 ================= */
  const factionAEl = document.getElementById('factionA');
  const factionBEl = document.getElementById('factionB');
  const stanceProLabel = document.getElementById('stanceProLabel');
  const stanceConLabel = document.getElementById('stanceConLabel');

  function syncStanceLabels() {
    const a = factionAEl.value.trim() || '찬성이오';
    const b = factionBEl.value.trim() || '난 반댈세';
    if (stanceProLabel) stanceProLabel.textContent = `👍 ${a}`;
    if (stanceConLabel) stanceConLabel.textContent = `👎 ${b}`;
  }
  factionAEl.addEventListener('input', syncStanceLabels);
  factionBEl.addEventListener('input', syncStanceLabels);

  /* ================= 미디어 타입 탭 (사진 / 동영상 배타) ================= */
  // window.__MEDIA_MODE__: 'photo' | 'video'
  window.__MEDIA_MODE__ = 'photo';
  const mediaTabs = document.querySelectorAll('.media-tab');
  const panePhoto = document.getElementById('pane-photo');
  const paneVideo = document.getElementById('pane-video');

  function setMediaMode(mode) {
    window.__MEDIA_MODE__ = mode;
    mediaTabs.forEach(t => t.classList.toggle('active', t.dataset.media === mode));
    if (panePhoto) panePhoto.hidden = mode !== 'photo';
    if (paneVideo) paneVideo.hidden = mode !== 'video';

    // 배타: 선택하지 않은 쪽 미디어는 비워 발행에 섞이지 않도록
    if (mode === 'photo') {
      videoInput.value = '';
      videoPreview.innerHTML = '';
      // 사진으로 바꿨는데 영상 전송이 계속 돌면 데이터만 태운다 → 중단
      window.GALLA_bgVideo && window.GALLA_bgVideo.clear();
      document.getElementById('vupBar')?.remove();
      renderThumbs(); // 이전에 담아둔 사진 스트립 복원
    } else {
      thumbInput.value = '';
      thumbPreview.innerHTML = '';
    }
  }
  mediaTabs.forEach(tab => {
    tab.addEventListener('click', () => setMediaMode(tab.dataset.media));
  });

  /* ================= 단계 네비게이션 ================= */
  const panel1 = document.getElementById('panel-1');
  const panel2 = document.getElementById('panel-2');
  const wizardSteps = document.querySelectorAll('.wizard-step');

  function goStep(n) {
    if (panel1) panel1.hidden = n !== 1;
    if (panel2) panel2.hidden = n !== 2;
    wizardSteps.forEach(s => s.classList.toggle('active', Number(s.dataset.step) <= n));
    // 미리보기 열려있으면 접기
    if (issuePreview) issuePreview.innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function hasMedia() {
    return window.__MEDIA_MODE__ === 'photo'
      ? (croppedImages.length > 0)
      : (videoInput.files && videoInput.files.length > 0);
  }

  document.getElementById('toStep2')?.addEventListener('click', () => {
    if (!hasMedia()) {
      alert(window.__MEDIA_MODE__ === 'photo'
        ? '사진을 1장 이상 올려주세요.'
        : '동영상을 올려주세요.');
      return;
    }
    goStep(2);
  });
  document.getElementById('backStep1')?.addEventListener('click', () => goStep(1));
  wizardSteps.forEach(s => {
    s.addEventListener('click', () => {
      const target = Number(s.dataset.step);
      if (target === 1) goStep(1);
      else if (target === 2 && hasMedia()) goStep(2);
    });
  });

  /* ================= AI MODAL ================= */
  const openAiBtn = document.getElementById('openAiModal');
  const aiModal = document.getElementById('aiModal');
  const aiClose = document.getElementById('aiClose');
  const aiUserText = document.getElementById('aiUserText');
  const aiResultText = document.getElementById('aiResultText');
  const applyAi = document.getElementById('applyAi');

  openAiBtn.addEventListener('click', e => {
    e.preventDefault();
    aiUserText.value = descEl.value;
    aiModal.style.display = 'flex';
    body.style.overflow = 'hidden';
  });

  aiClose.addEventListener('click', () => {
    aiModal.style.display = 'none';
    body.style.overflow = '';
  });

  applyAi.addEventListener('click', () => {
    if (aiResultText.value) {
      descEl.value = aiResultText.value;
    }
    aiModal.style.display = 'none';
    body.style.overflow = '';
  });

  /* ================= PREVIEW ================= */
  form.addEventListener('submit', e => {
    e.preventDefault();

    if (!categoryEl.value) {
      alert('카테고리를 선택해주세요');
      categoryEl.focus();
      return;
    }

    if (!titleEl.value) {
      alert('제목을 입력해주세요');
      titleEl.focus();
      return;
    }

    if (!descEl.value) {
      alert('이슈 설명을 입력해주세요');
      descEl.focus();
      return;
    }

    if (!donationEl.value) {
      alert('기부처를 선택해주세요');
      donationEl.focus();
      return;
    }

    const authorStance = [...authorStanceEls].find(r => r.checked)?.value;

    if (!authorStance) {
      alert('이 이슈에 대한 나의 입장을 선택해주세요');
      return;
    }


    const anon = false;   // 발의는 실명 (익명은 유령권 댓글 전용)
    const thumbImg = thumbPreview.querySelector('img');
    const videoEl = videoPreview.querySelector('video');

    /* ── 미리보기 ─────────────────────────────────────────
       발행 뒤 이슈 페이지(issue.html)와 '같은 순서·같은 구성'으로 보여준다.
       예전 미리보기는 순서가 실제와 달랐고(미디어가 중간), 실제로는 없는
       '🎥 1분 엘리베이터 스피치' 버튼이 떴다 → 사장님 제보로 제거.
       실제 순서: 작성자 헤드 → 미디어 → 제목·한줄 → 액션바 → 진영 선택 → 핵심 요약 */
    const esc = (s) => (s == null ? '' : String(s).replace(/[&<>"]/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));

    const factionA = factionAEl.value.trim() || '찬성이오';
    const factionB = factionBEl.value.trim() || '난 반댈세';
    const imgSrcs = croppedImages.map(f => URL.createObjectURL(f));

    let mediaHtml = '';
    if (videoEl && videoEl.src) {
      mediaHtml = `<div class="prev-media">
        <video src="${esc(videoEl.src)}" controls playsinline muted preload="metadata"></video>
      </div>`;
    } else if (imgSrcs.length) {
      mediaHtml = `<div class="prev-media">
        <img src="${esc(imgSrcs[0])}" alt="">
        ${imgSrcs.length > 1 ? `<div class="prev-dots">${
          imgSrcs.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')
        }</div><div class="prev-count">1/${imgSrcs.length}</div>` : ''}
      </div>`;
    } else if (thumbImg) {
      mediaHtml = `<div class="prev-media"><img src="${esc(thumbImg.src)}" alt=""></div>`;
    }

    issuePreview.innerHTML = `
      <section class="issue-preview">
        <div class="prev-note">발행하면 이렇게 보여요 · 아래 버튼들은 미리보기라 동작하지 않아요</div>

        <div class="prev-card">
          <div class="prev-head">
            <div class="prev-avatar"></div>
            <div class="prev-head-info">
              <div class="prev-author">작성자 · ${anon ? '익명' : '나'}</div>
              <div class="prev-sub">${esc(categoryEl.value)} · 방금 전 · 조회 0</div>
            </div>
            <span class="prev-follow">+ 팔로우</span>
          </div>

          ${mediaHtml}

          <div class="prev-caption">
            <h1>${esc(titleEl.value)}</h1>
            <p>${esc(oneLineEl.value)}</p>
          </div>

          <div class="prev-actions-row">
            <span>♥ 0</span><span>저장</span><span>공유</span>
          </div>

          <div class="prev-sec">
            <div class="prev-sec-title">⚔️ 진영 선택</div>
            <div class="gv" id="prevGv"></div>
            <p class="prev-stance">내 입장 · ${esc(authorStance === 'pro' ? factionA : factionB)}</p>
          </div>

          <div class="prev-sec">
            <div class="prev-sec-title">📝 핵심 요약</div>
            <p class="prev-body">${esc(descEl.value)}</p>
          </div>

          <div class="prev-sec prev-sec-dim">
            <div class="prev-sec-title">💰 기부처</div>
            <p class="prev-body">${esc(donationEl.value)}</p>
          </div>
        </div>

        <div class="preview-actions">
          <button type="button" id="editPreview">수정하기</button>
          <button type="button" id="publishPreview">발행 전 적합성 검사</button>
        </div>
      </section>
    `;

    // 진영바는 실제 페이지와 같은 컴포넌트를 쓴다(모양이 어긋나지 않게)
    if (window.GALLA_VoteBar) {
      window.GALLA_VoteBar.mount(document.getElementById('prevGv'), {
        factionA, factionB, pro: 0, con: 0, myStance: authorStance,
      });
    }

    document.getElementById('editPreview').onclick = () => {
      issuePreview.innerHTML = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    document.getElementById('publishPreview').onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const supabase = window.supabaseClient;
      if (!supabase || !supabase.auth || !supabase.from) {
        alert('Supabase 초기화 실패');
        return;
      }

      const { data: sessionData } =
        await supabase.auth.getSession();

      const user = sessionData?.session?.user;

      if (!user) {
        alert('로그인이 필요합니다.');
        return;
      }

      let thumbnail_url = null;
      let video_url = null;
      let images = null;
      let card_thumb_url = null;

      // Cloudflare R2 업로드 (이미지 여러 장 + 영상)
      const publishBtn = document.getElementById('publishPreview');
      const imageFiles = croppedImages.length ? croppedImages : [...(thumbInput.files || [])];
      const videoFile = videoInput.files && videoInput.files[0];

      try {
        publishBtn.disabled = true;
        if (imageFiles.length > 0) {
          images = [];
          for (let i = 0; i < imageFiles.length; i++) {
            const label = `이미지 업로드 중… (${i + 1}/${imageFiles.length})`;
            publishBtn.textContent = label;
            images.push(await window.GALLA_UPLOAD_MEDIA(imageFiles[i], 'image',
              p => { publishBtn.textContent = p == null ? label : `${label} ${p}%`; }));
          }
          thumbnail_url = images[0];
        }

        if (videoFile) {
          // 영상을 고른 순간 이미 배경 업로드가 돌고 있다 → 끝났으면 즉시, 진행 중이면 이어받는다.
          // (배경 업로드가 실패했거나 없으면 result()가 알아서 지금 올린다)
          publishBtn.textContent = '영상 업로드 중…';
          const onP = p => { publishBtn.textContent = p == null ? '영상 업로드 중…' : `영상 업로드 중… ${p}%`; };
          const out = window.GALLA_bgVideo
            ? await window.GALLA_bgVideo.result(videoFile, onP)
            : await window.GALLA_UPLOAD_VIDEO(videoFile, onP);
          video_url = out.url || out.hls;
          if (!thumbnail_url && out.thumbnail) thumbnail_url = out.thumbnail;
        }

        const cardThumbFile = cardThumbInput && cardThumbInput.files && cardThumbInput.files[0];
        if (cardThumbFile) {
          publishBtn.textContent = '썸네일 업로드 중…';
          card_thumb_url = await window.GALLA_UPLOAD_MEDIA(cardThumbFile, 'image',
            p => { publishBtn.textContent = p == null ? '썸네일 업로드 중…' : `썸네일 업로드 중… ${p}%`; });
        }
      } catch (err) {
        console.error('[UPLOAD ERROR]', err);
        alert(err.message === 'stall'
          ? '업로드가 지연되고 있습니다. 네트워크 상태를 확인하고 다시 시도해주세요.'
          : '미디어 업로드에 실패했습니다. 잠시 후 다시 시도해주세요.');
        publishBtn.textContent = '발행 전 적합성 검사';
        publishBtn.disabled = false;
        return;
      }
      publishBtn.textContent = '발행 전 적합성 검사';
      publishBtn.disabled = false;

      // Prepare payload for issues_draft
      const draftPayload = {
        user_id: user.id,              // 🔥 RLS 필수
        category: categoryEl.value,
        title: titleEl.value,
        one_line: oneLineEl.value || null,
        description: descEl.value,
        donation_target: donationEl.value,
        is_anonymous: anon,
        author_stance: authorStance,
        faction_a: factionAEl.value.trim() || null,
        faction_b: factionBEl.value.trim() || null,
        status: 'draft',
        draft_mode: 'check',
        moderation_status: 'pending',
        updated_at: new Date().toISOString(),
      };

      // INSERT 시 created_at 보장
      let draftId = sessionStorage.getItem('__CURRENT_DRAFT_ID__');
      let row;
      if (!draftId) {
        draftPayload.created_at = new Date().toISOString();

        // Only set thumbnail_url/video_url if we just uploaded
        if (thumbnail_url) draftPayload.thumbnail_url = thumbnail_url;
        if (video_url) draftPayload.video_url = video_url;
        if (images) draftPayload.images = images;
        if (card_thumb_url) draftPayload.card_thumb_url = card_thumb_url;

        // INSERT
        const { data, error } = await supabase
          .from('issues_draft')
          .insert([draftPayload])
          .select()
          .single();
        if (error || !data) {
          alert('임시 저장에 실패했습니다.');
          return;
        }
        draftId = data.id;
        sessionStorage.setItem('__CURRENT_DRAFT_ID__', draftId);
        row = data;
      } else {
        // UPDATE (do not null thumbnail_url/video_url if not reselected)
        // First, fetch current row
        const { data: existing, error: fetchErr } = await supabase
          .from('issues_draft')
          .select('thumbnail_url,video_url,images,card_thumb_url')
          .eq('id', draftId)
          .single();
        if (fetchErr || !existing) {
          alert('임시 저장 로드에 실패했습니다.');
          return;
        }
        if (thumbnail_url) draftPayload.thumbnail_url = thumbnail_url;
        else if (existing.thumbnail_url) draftPayload.thumbnail_url = existing.thumbnail_url;
        if (video_url) draftPayload.video_url = video_url;
        else if (existing.video_url) draftPayload.video_url = existing.video_url;
        if (images) draftPayload.images = images;
        else if (existing.images) draftPayload.images = existing.images;
        if (card_thumb_url) draftPayload.card_thumb_url = card_thumb_url;
        else if (existing.card_thumb_url) draftPayload.card_thumb_url = existing.card_thumb_url;
        const { error: updateErr, data: updated } = await supabase
          .from('issues_draft')
          .update(draftPayload)
          .eq('id', draftId)
          .select()
          .single();
        if (updateErr || !updated) {
          alert('임시 저장 갱신에 실패했습니다.');
          return;
        }
        row = updated;
      }

      // Redirect to confirm.html with draft id and mode
      location.href = `confirm.html?draft=${draftId}&mode=check`;
    };

    if (videoEl) {
      document.getElementById('openSpeech').onclick = () => {
        openSpeech(videoEl.src);
      };
    }

    issuePreview.scrollIntoView({ behavior: 'smooth' });
  });

  /* ================= VIDEO MODAL ================= */
  const speechModal = document.getElementById('speechModal');
  const speechVideo = document.getElementById('speechVideo');
  const closeSpeech = document.getElementById('closeSpeech');

  function openSpeech(src) {
    speechVideo.src = src;
    speechModal.style.display = 'flex';
    body.style.overflow = 'hidden';
    speechVideo.currentTime = 0;
    speechVideo.play().catch(() => {});
  }

  closeSpeech.addEventListener('click', () => {
    speechVideo.pause();
    speechVideo.src = '';
    speechModal.style.display = 'none';
    body.style.overflow = '';
  });
});
