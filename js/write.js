/* 이중 모드(2026-07-27) — MPA(단독 문서)면 기존처럼 DOMContentLoaded 자동 초기화,
   SPA(app.html)면 어댑터(js/spa/views/write.js)가 GALLA_PAGE_WRITE.mount()로 부른다.
   ctx: { root, params, cleanups } — SPA에서만 전달(타이머·리스너 해제용). */
/* 🔖 해시태그 공용 헬퍼(가드) — 전용칸 + 본문 #태그 자동추출을 tags[]로. */
if (!window.GALLA_collectTags) {
  window.GALLA_extractHashtags = t => { const o=[]; (String(t||'').match(/#([0-9A-Za-z가-힣_]{1,30})/g)||[]).forEach(m=>{const x=m.slice(1).toLowerCase(); if(x&&!o.includes(x))o.push(x);}); return o; };
  window.GALLA_parseTagInput = v => { const o=[]; String(v||'').split(/[\s,]+/).forEach(s=>{const x=s.replace(/[^0-9A-Za-z가-힣_]/g,'').toLowerCase(); if(x&&x.length<=30&&!o.includes(x))o.push(x);}); return o; };
  window.GALLA_collectTags = (inp,...txt)=>{ const o=[]; const add=x=>{if(x&&!o.includes(x))o.push(x);}; window.GALLA_parseTagInput(inp).forEach(add); txt.forEach(tx=>window.GALLA_extractHashtags(tx).forEach(add)); return o.slice(0,10); };
}
function initWritePage(ctx) {
  ctx = ctx || {};
  const __root = ctx.root || null;
  const onCleanup = (fn) => { if (ctx.cleanups) ctx.cleanups.push(fn); };
  // 스크롤 최상단 — SPA에선 문서가 아니라 스택 뷰(.view-host)가 스크롤 주체
  const scrollTopSmooth = () => {
    const host = __root && __root.closest ? __root.closest('.view-host') : null;
    (host || window).scrollTo({ top: 0, behavior: 'smooth' });
  };
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
  // ⚠️ 자동복원 안 함 — 재진입 시 '이어서 작성' 배너로 명시적 복원(아래 진입 분기)
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
  // 즉시 업로드로 확보한 URL(복원·발행 재사용) — 영상/카드썸네일
  let cachedVideoUrl = null;
  let cardThumbUrlCache = null;
  if (cardThumbInput) {
    cardThumbInput.addEventListener('change', () => {
      const f = cardThumbInput.files && cardThumbInput.files[0];
      if (!f) return;
      cardThumbImg.src = URL.createObjectURL(f);
      cardThumbPreview.hidden = false;
      cardThumbLabel.hidden = true;
      cardThumbUrlCache = null;
      // 🚀 고르는 즉시 업로드 → 발행 때 재업로드 없이 URL 재사용
      (async () => {
        try {
          if (typeof window.GALLA_UPLOAD_MEDIA === 'function') {
            cardThumbUrlCache = await window.GALLA_UPLOAD_MEDIA(f, 'image');
            window.GALLA_WriteMedia && window.GALLA_WriteMedia.setCardThumb(cardThumbUrlCache);
          }
        } catch (e) { console.warn('[write] 카드썸네일 즉시 업로드 실패', e); }
      })();
    });
    cardThumbClear.addEventListener('click', () => {
      cardThumbInput.value = '';
      cardThumbPreview.hidden = true;
      cardThumbLabel.hidden = false;
      cardThumbUrlCache = null;
      try { window.GALLA_WriteMedia && window.GALLA_WriteMedia.setCardThumb(null); } catch (_) {}
    });
  }

  const MAX_IMAGES = 10;

  /* 사진 통합 모델 — 각 항목 { file, url, up }
     · file: 4:5 크롭 완료 File(새로 고른 것)   · url: R2에 '즉시 업로드'로 확보(복원·발행 재사용)
     · up  : 업로드 진행 중 표시
     나갔다 와도(앱을 껐다 켜도) url로 복원되고, 발행 땐 재업로드하지 않는다. */
  let imgItems = [];
  const imgSources = () => imgItems.map(it => it.url || (it.file ? URL.createObjectURL(it.file) : null)).filter(Boolean);
  function persistImages() {
    try { window.GALLA_WriteMedia && window.GALLA_WriteMedia.setImages(imgItems.map(it => it.url).filter(Boolean)); } catch (_) {}
  }

  // 선택된 사진 미리보기 렌더 — 각 장 삭제(✕) + 마지막에 추가(＋) 타일
  function renderThumbs() {
    if (!imgItems.length) {
      thumbPreview.innerHTML = '';
      if (thumbBtn) thumbBtn.style.display = '';   // 드롭존을 다시 보이게
      return;
    }
    if (thumbBtn) thumbBtn.style.display = 'none';
    thumbPreview.innerHTML = `
      <div class="multi-img-strip">
        ${imgItems.map((it, i) => `
          <div class="multi-img-item${it.up ? ' uploading' : ''}">
            <img src="${it.url || (it.file ? URL.createObjectURL(it.file) : '')}">
            ${it.up ? '<span class="multi-img-up"><i></i></span>' : ''}
            ${i === 0 ? '<span class="multi-img-badge">대표</span>' : ''}
            <button type="button" class="multi-img-del" data-idx="${i}" aria-label="삭제">✕</button>
          </div>
        `).join('')}
        ${imgItems.length < MAX_IMAGES
          ? `<button type="button" class="multi-img-add" id="thumbAddMore" aria-label="사진 추가">＋</button>`
          : ''}
      </div>
      <div class="guide-text">${imgItems.length}/${MAX_IMAGES}장 · 첫 장이 대표${imgItems.length > 1 ? ' · 캐러셀로 노출' : ''}</div>
    `;
  }

  // 개별 사진 즉시 업로드 → url 확보 후 캐시 반영
  async function uploadItem(it) {
    if (!it.file || it.url) return;
    it.up = true;
    try {
      if (typeof window.GALLA_UPLOAD_MEDIA === 'function') {
        it.url = await window.GALLA_UPLOAD_MEDIA(it.file, 'image');
      }
    } catch (err) {
      console.warn('[write] 사진 즉시 업로드 실패 — 발행 때 재시도', err);
    } finally {
      it.up = false;
      renderThumbs();
      persistImages();
    }
  }

  async function addFiles(files) {
    files = [...(files || [])].filter(Boolean);
    if (!files.length) return;
    const room = MAX_IMAGES - imgItems.length;
    if (room <= 0) { alert(`이미지는 최대 ${MAX_IMAGES}장까지 올릴 수 있습니다.`); return; }
    if (files.length > room) {
      alert(`${room}장만 더 추가할 수 있어 처음 ${room}장만 담았습니다.`);
      files = files.slice(0, room);
    }
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
    const added = processed.map(f => ({ file: f, url: null, up: true }));
    imgItems = imgItems.concat(added);   // 기존에 이어붙이기(교체 아님)
    if (typeof removeResumeBanner === 'function') removeResumeBanner();   // 새로 고르면 이어쓰기 배너 닫기
    renderThumbs();
    window.GALLA_WriteMedia && window.GALLA_WriteMedia.setMode('photo');
    added.forEach(it => uploadItem(it));   // 🚀 고르는 즉시 병렬 업로드
  }

  // label[for] 이 네이티브로 파일창을 염. 재선택 위해 열릴 때 value 초기화.
  thumbInput.addEventListener('click', () => { thumbInput.value = ''; });
  thumbInput.addEventListener('change', e => { addFiles(e.target.files); });

  // 스트립 내 삭제(✕) / 추가(＋) 위임
  thumbPreview.addEventListener('click', e => {
    const del = e.target.closest('.multi-img-del');
    if (del) {
      imgItems.splice(Number(del.dataset.idx), 1);
      renderThumbs();
      persistImages();
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
    cachedVideoUrl = null;
    if (typeof removeResumeBanner === 'function') removeResumeBanner();   // 새로 고르면 이어쓰기 배너 닫기
    window.GALLA_WriteMedia && window.GALLA_WriteMedia.setMode('video');
    let tick = null;
    onCleanup(() => { if (tick) clearInterval(tick); });   // SPA unmount 시 진행표시 타이머 해제
    tick = setInterval(async () => {
      const p = window.GALLA_bgVideo.progress();
      const done = window.GALLA_bgVideo.isDone();
      bar.textContent = done
        ? '✅ 영상 준비 완료 — 바로 발행할 수 있어요'
        : `⬆️ 영상 미리 올리는 중… ${p}% (글을 계속 쓰셔도 됩니다)`;
      if (done) {
        clearInterval(tick);
        // 🚀 업로드 끝난 URL을 캐시에 저장 → 나갔다 와도(앱을 껐다 켜도) 복원, 발행 땐 재사용
        try {
          const out = await window.GALLA_bgVideo.result(f);
          const url = out && (out.url || out.hls);
          if (url) {
            cachedVideoUrl = url;
            window.GALLA_WriteMedia && window.GALLA_WriteMedia.setVideo(url, f.name);
          }
        } catch (_) {}
      }
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
    try { window.GALLA_WriteMedia && window.GALLA_WriteMedia.setMode(mode); } catch (_) {}

    // 배타: 선택하지 않은 쪽 미디어는 비워 발행에 섞이지 않도록
    if (mode === 'photo') {
      videoInput.value = '';
      videoPreview.innerHTML = '';
      cachedVideoUrl = null;
      try { window.GALLA_WriteMedia && window.GALLA_WriteMedia.clearVideo(); } catch (_) {}
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
    try { window.GALLA_WriteMedia && window.GALLA_WriteMedia.setStep(n); } catch (_) {}   // 나갔다 와도 스텝 복원
    scrollTopSmooth();
  }

  function hasMedia() {
    return window.__MEDIA_MODE__ === 'photo'
      ? (imgItems.length > 0)
      : ((videoInput.files && videoInput.files.length > 0) || !!cachedVideoUrl);
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

  /* ♻️ 즉시 업로드+복원 — 나갔다 와도(앱을 껐다 켜도) 고른 미디어·스텝을 되살린다.
     텍스트는 GALLA_draft가 복원, 미디어는 여기(localStorage URL 캐시)로 복원.
     ⚠️ confirm→뒤로(?draft=…) 복귀는 DB draft 복원(GALLA_WRITE_INITS.restore)이 담당 → 중복 방지 위해 건너뜀. */
  function restoreMediaCache() {
    // DB draft 복원 경로(confirm→뒤로)면 양보 — SPA는 params, MPA는 URL ?draft=
    let _qDraft = ctx.params && ctx.params.draft;
    if (!_qDraft) { try { _qDraft = new URLSearchParams(location.search).get('draft'); } catch (_) {} }
    if (_qDraft) return;
    let c = null;
    try { c = window.GALLA_WriteMedia && window.GALLA_WriteMedia.get(); } catch (_) {}
    if (!c) return;
    const mode = c.mode || (c.video_url ? 'video' : 'photo');
    let restored = false;
    if (mode === 'video' && c.video_url) {
      setMediaMode('video');
      cachedVideoUrl = c.video_url;
      videoPreview.innerHTML = '';
      const v = document.createElement('video');
      v.src = c.video_url; v.controls = true; v.playsInline = true; v.muted = true;
      videoPreview.appendChild(v);
      const bar = ensureVideoBar();
      bar.textContent = '✅ 영상 준비 완료 — 바로 발행할 수 있어요';
      restored = true;
    } else if (Array.isArray(c.images) && c.images.length) {
      setMediaMode('photo');
      imgItems = c.images.map(u => ({ file: null, url: u, up: false }));
      renderThumbs();
      restored = true;
    }
    // 카드 썸네일(선택) 복원
    if (c.card_thumb_url && cardThumbImg && cardThumbPreview && cardThumbLabel) {
      cardThumbUrlCache = c.card_thumb_url;
      cardThumbImg.src = c.card_thumb_url;
      cardThumbPreview.hidden = false;
      cardThumbLabel.hidden = true;
    }
    if (restored && Number(c.step) === 2) goStep(2);
  }

  /* ── 임시저장 이어쓰기(인스타식) ───────────────────────────────
     재진입 시 자동 복원하지 않고, 미디어 픽커 상단 '이어서 작성' 배너로 경로를 준다.
     · 이어서 작성 → 텍스트+미디어+스텝 복원  · 🗑 → 임시저장 삭제(확인 시트)
     · confirm→뒤로(?draft=)는 DB 복원이 담당 → 배너 대신 텍스트도 여기서 복원. */
  function removeResumeBanner() { const b = document.getElementById('wrResume'); if (b) b.remove(); }
  function resumeDraft() {
    if (__wd) { try { __wd.restore(); } catch (_) {} }
    try { restoreMediaCache(); } catch (e) { console.warn('[write] 미디어 복원 실패', e); }
    removeResumeBanner();
  }
  function discardDraft() {
    try { window.GALLA_WriteMedia && window.GALLA_WriteMedia.clear(); } catch (_) {}
    try { __wd && __wd.clear(); } catch (_) {}
    try { sessionStorage.removeItem('__CURRENT_DRAFT_ID__'); } catch (_) {}
    imgItems = []; cachedVideoUrl = null; cardThumbUrlCache = null;
    renderThumbs();
    if (videoPreview) videoPreview.innerHTML = '';
    if (cardThumbPreview) { cardThumbPreview.hidden = true; if (cardThumbLabel) cardThumbLabel.hidden = false; }
    document.getElementById('vupBar')?.remove();
    removeResumeBanner();
  }
  function showResumeBanner() {
    removeResumeBanner();
    const c = (window.GALLA_WriteMedia && window.GALLA_WriteMedia.get()) || {};
    const thumb = (Array.isArray(c.images) && c.images[0]) || c.card_thumb_url || '';
    const isVid = !thumb && !!c.video_url;
    let draftTitle = '';
    try { const d = JSON.parse(localStorage.getItem('galla_draft_write') || 'null'); if (d && d.v) draftTitle = d.v.title || d.v.oneLine || d.v.category || ''; } catch (_) {}
    const days = (window.GALLA_WriteMedia && window.GALLA_WriteMedia.daysLeft && window.GALLA_WriteMedia.daysLeft()) || 7;
    const safe = s => String(s || '').replace(/[<>&]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m]));
    const el = document.createElement('div');
    el.className = 'wr-resume'; el.id = 'wrResume';
    el.innerHTML =
      (thumb ? `<img class="wr-resume-thumb" src="${safe(thumb)}">`
             : `<div class="wr-resume-thumb none">${isVid ? '🎬' : '📝'}</div>`) +
      `<div class="wr-resume-info">
         <div class="wr-resume-title">${safe(draftTitle || '작성하던 글')}</div>
         <div class="wr-resume-sub">임시저장 · ${days}일 후 자동 삭제</div>
       </div>
       <button type="button" class="wr-resume-go" id="wrResumeGo">이어서 작성</button>
       <button type="button" class="wr-resume-del" id="wrResumeDel" aria-label="임시저장 삭제">🗑</button>`;
    const p1 = document.getElementById('panel-1');
    if (p1) p1.insertBefore(el, p1.firstChild);
    el.querySelector('#wrResumeGo').addEventListener('click', resumeDraft);
    el.querySelector('#wrResumeDel').addEventListener('click', () => {
      window.GALLA_ActionSheet && window.GALLA_ActionSheet({
        title: '임시저장을 삭제할까요?',
        message: '삭제하면 되돌릴 수 없어요.',
        actions: [
          { label: '삭제', style: 'destructive', onClick: discardDraft },
          { label: '취소', style: 'cancel', onClick: () => {} },
        ],
      });
    });
  }

  // 진입 분기 — 재진입이면 배너, confirm 복귀면 텍스트 복원
  let _qDraftParam = ctx.params && ctx.params.draft;
  if (!_qDraftParam) { try { _qDraftParam = new URLSearchParams(location.search).get('draft'); } catch (_) {} }
  const _hasTextDraft = () => { try { return !!(__wd && __wd.has && __wd.has()); } catch (_) { return false; } };
  const _hasMediaDraft = () => { try { return !!(window.GALLA_WriteMedia && window.GALLA_WriteMedia.hasMedia()); } catch (_) { return false; } };
  if (_qDraftParam) {
    if (__wd) { try { __wd.restore(); } catch (_) {} }
  } else if (_hasTextDraft() || _hasMediaDraft()) {
    try { showResumeBanner(); } catch (e) { console.warn('[write] 이어쓰기 배너 실패', e); }
  }

  /* 뒤로가기 시트(인스타식)용 — GALLA_PAGE_WRITE.mount 의 .wr-back 핸들러가 호출 */
  window.GALLA_WRITE_hasContent = () => {
    if (imgItems.length > 0 || cachedVideoUrl) return true;
    return [categoryEl, titleEl, oneLineEl, descEl, factionAEl, factionBEl].some(el => el && el.value && el.value.trim());
  };
  window.GALLA_WRITE_saveDraftNow = () => { try { __wd && __wd.saveNow && __wd.saveNow(); } catch (_) {} };
  window.GALLA_WRITE_discardDraft = () => {
    try { window.GALLA_WriteMedia && window.GALLA_WriteMedia.clear(); } catch (_) {}
    try { __wd && __wd.clear(); } catch (_) {}
    try { sessionStorage.removeItem('__CURRENT_DRAFT_ID__'); } catch (_) {}
  };

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
    const imgSrcs = imgSources();

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
      scrollTopSmooth();
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
      // 🚀 즉시 업로드로 이미 URL이 확보돼 있으면 재업로드하지 않고 그대로 쓴다.
      const publishBtn = document.getElementById('publishPreview');
      const O = window.GALLA_UploadOverlay;
      const photoMode = window.__MEDIA_MODE__ !== 'video';
      const videoFile = videoInput.files && videoInput.files[0];
      const cardThumbFile = cardThumbInput && cardThumbInput.files && cardThumbInput.files[0];

      // 아직 안 올라간 게 있으면 인스타식 전체화면 진행 UI를 띄운다(발행 전 검사 직전).
      const pendingImgItem = photoMode ? imgItems.find(it => !it.url && it.file) : null;
      const needImg = !!pendingImgItem;
      const needVid = !!videoFile && !cachedVideoUrl;
      const needCard = !!cardThumbFile && !cardThumbUrlCache;
      const showOverlay = !!O && (needImg || needVid || needCard);

      try {
        publishBtn.disabled = true;
        publishBtn.textContent = '업로드 중…';
        if (showOverlay) {
          O.show({
            label: '업로드 중…',
            thumb: needVid ? { file: videoFile } : (needImg ? { file: pendingImgItem.file } : { file: cardThumbFile }),
          });
        }

        // 이미지 — 항목별: url 있으면 그대로, 없으면(새로 고른 것) 지금 업로드.
        //  (복원된 url-only 사진 + 새 file 사진이 섞여도 순서/개수를 잃지 않는다)
        if (photoMode && imgItems.length > 0) {
          images = [];
          for (let i = 0; i < imgItems.length; i++) {
            const it = imgItems[i];
            if (it.url) { images.push(it.url); continue; }
            if (!it.file) continue;
            if (O && showOverlay) { O.thumb({ file: it.file }); O.label(`사진 업로드 중… (${i + 1}/${imgItems.length})`); }
            const u = await window.GALLA_UPLOAD_MEDIA(it.file, 'image',
              p => { if (O && showOverlay) O.progress(p == null ? 0 : p); });
            it.url = u;
            images.push(u);
          }
          thumbnail_url = images[0];
        }

        // 영상 — 배경 업로드가 끝났으면 캐시 URL 즉시, 아니면 여기서 이어/새로 올린다.
        if (videoFile) {
          if (O && showOverlay) { O.thumb({ file: videoFile }); O.label('영상 업로드 중…'); }
          const onP = p => { if (O && showOverlay) O.progress(p == null ? 0 : p); };
          const out = window.GALLA_bgVideo
            ? await window.GALLA_bgVideo.result(videoFile, onP)
            : await window.GALLA_UPLOAD_VIDEO(videoFile, onP);
          video_url = out.url || out.hls;
          if (!thumbnail_url && out.thumbnail) thumbnail_url = out.thumbnail;
        } else if (cachedVideoUrl && window.__MEDIA_MODE__ === 'video') {
          video_url = cachedVideoUrl;   // 복원된(이미 올라간) 영상 재사용
        }

        // 카드 썸네일
        if (cardThumbFile) {
          if (O && showOverlay) { O.thumb({ file: cardThumbFile }); O.label('썸네일 업로드 중…'); }
          card_thumb_url = await window.GALLA_UPLOAD_MEDIA(cardThumbFile, 'image',
            p => { if (O && showOverlay) O.progress(p == null ? 0 : p); });
        } else if (cardThumbUrlCache) {
          card_thumb_url = cardThumbUrlCache;
        }

        if (O && showOverlay) { O.done('완료'); await new Promise(r => setTimeout(r, 480)); O.hide(); }
      } catch (err) {
        console.error('[UPLOAD ERROR]', err);
        try { O && O.hide(); } catch (_) {}
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
      // 🔖 해시태그 — 전용칸(#issue-tags) + 제목·본문 #태그 자동추출
      {
        const _tagEl = document.getElementById('issue-tags');
        const _tags = window.GALLA_collectTags(_tagEl ? _tagEl.value : '', titleEl.value, descEl.value);
        draftPayload.tags = _tags.length ? _tags : null;
      }

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
      // (SPA 단일문서면 문서 이탈 없이 confirm 뷰를 스택 push — 데이터 전달 방식은 동일: draft id)
      if (document.body && document.body.dataset.page === 'spa' && window.GALLA_SPA && window.GALLA_SPA.push) {
        window.GALLA_SPA.push('confirm', { draft: draftId, mode: 'check' });
      } else {
        location.href = `confirm.html?draft=${draftId}&mode=check`;
      }
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
}

/* 이중 모드 — MPA(단독 문서, body data-page≠'spa')면 기존처럼 자동 초기화. */
if (!(document.body && document.body.dataset.page === 'spa')) {
  document.addEventListener('DOMContentLoaded', () => initWritePage());
}

/* ============ SPA 페이지 훅 ============
   초기화는 위 initWritePage 그대로. write.ai / draft.restore / draft.save 는
   각자 window.GALLA_WRITE_INITS 에 init을 등록(MPA에선 각자 DOMContentLoaded 자동 실행).
   MPA 단독 문서에서는 존재만 하고 아무도 안 부르므로 동작 불변. */
window.GALLA_PAGE_WRITE = {
  _root: null,
  _cleanups: null,
  async mount(root, params) {
    this._root = root || null;
    this._cleanups = [];
    const ctx = { root: this._root, params: params || {}, cleanups: this._cleanups };
    initWritePage(ctx);
    const I = window.GALLA_WRITE_INITS || {};
    try { I.ai && I.ai(ctx); } catch (e) { console.error('[write spa] ai init', e); }
    try { I.restore && await I.restore(ctx); } catch (e) { console.error('[write spa] restore init', e); }
    try { I.save && I.save(ctx); } catch (e) { console.error('[write spa] save init', e); }

    if (root) {
      // 🔙 상단 뒤로(.wr-back) — 작성 내용이 있으면 인스타식 시트(다시 시작/임시 저장/계속),
      //    없으면 바로 스택 pop. (SPA엔 back.js 미탑재 → 여기서 처리)
      root.querySelectorAll('.wr-back').forEach(b => {
        if (b.dataset.spaBound) return;
        b.dataset.spaBound = '1';
        b.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          const pop = () => { try { window.GALLA_SPA && window.GALLA_SPA.pop(); } catch (_) {} };
          const has = window.GALLA_WRITE_hasContent && window.GALLA_WRITE_hasContent();
          if (!has || !window.GALLA_ActionSheet) { pop(); return; }
          window.GALLA_ActionSheet({
            title: '작성을 멈출까요?',
            message: "임시 저장하면 7일간 보관돼요. 다시 들어오면 사진·영상 고르는 화면에서 이어서 쓸 수 있어요.",
            actions: [
              { label: '다시 시작', style: 'destructive', onClick: () => { try { window.GALLA_WRITE_discardDraft && window.GALLA_WRITE_discardDraft(); } catch (_) {} pop(); } },
              { label: '임시 저장', onClick: () => { try { window.GALLA_WRITE_saveDraftNow && window.GALLA_WRITE_saveDraftNow(); } catch (_) {} try { window.GALLA_toast && window.GALLA_toast('임시 저장됨 · 7일간 보관'); } catch (_) {} pop(); } },
              { label: '계속 수정하기', style: 'cancel', onClick: () => {} },
            ],
          });
        }, true);
      });
      // 부가 UX(글자수 카운터·스텝칩) — MPA에선 write.html 인라인 스크립트 담당(SPA에선 로더가 제거)
      const d = root.querySelector('#description'), c = root.querySelector('#descCount');
      if (d && c && !d.dataset.spaCount) {
        d.dataset.spaCount = '1';
        const upd = () => { c.textContent = d.value.length; };
        d.addEventListener('input', upd); upd();
      }
      const chip = root.querySelector('#wrStepNum');
      if (chip) {
        root.querySelectorAll('.wizard-step').forEach(s => s.addEventListener('click', () => { chip.textContent = s.dataset.step; }));
        const t2 = root.querySelector('#toStep2'), b1 = root.querySelector('#backStep1');
        if (t2) t2.addEventListener('click', () => { setTimeout(() => { const p2 = root.querySelector('#panel-2'); if (p2 && !p2.hidden) chip.textContent = '2'; }, 0); });
        if (b1) b1.addEventListener('click', () => { chip.textContent = '1'; });
      }
    }
  },
  unmount() {
    (this._cleanups || []).forEach(f => { try { f(); } catch (_) {} });
    this._cleanups = null;
    this._root = null;
    // 배경 영상 업로드 중단(뷰가 사라지면 이어받을 발행도 없다) + 잠긴 body 스크롤 복구
    try { window.GALLA_bgVideo && window.GALLA_bgVideo.clear(); } catch (_) {}
    try { document.body.style.overflow = ''; } catch (_) {}
  }
};
