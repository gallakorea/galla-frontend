/* =========================================================
   ✍️ 이슈 작성 — 미디어 임시보존 + 업로드 진행 오버레이 (2026-07-30)
   ---------------------------------------------------------
   문제(사장님 제보): 2번째(본문) 페이지에서 다른 데 갔다 오면 미디어 픽커(1단계)로
     돌아가고, 고른 사진·영상이 사라져 다시 골라야 했다. 글(텍스트)만 살아남았다.
   해법(즉시 업로드+복원):
     · 고르는 즉시 R2로 올려 URL을 확보하고, 그 URL·스텝·모드를 localStorage에 남긴다.
     · 재진입 시 URL로 미리보기를 복원하고, 발행 때는 이미 올라간 URL을 그대로 쓴다(재업로드 X).
     · localStorage라 앱을 완전히 꺼도 7일간 이어쓰기 가능.
   또 하나(사장님 제보): 발행 전 검사 때 '영상 업로드 전체화면(퍼센트)'이 없이 바로 넘어갔다.
     → GALLA_UploadOverlay: 인스타식 전체화면 업로드 진행 UI. 검사/발행 때 남은 업로드를 감싼다.

   ⚠️ 텍스트 임시저장은 기존 js/draft.js(GALLA_draft)가 담당 — 여긴 미디어/스텝만.
   ========================================================= */
(function () {
  /* ─────────────── 미디어 캐시 (localStorage) ─────────────── */
  const K = 'galla_write_media';
  const RETENTION_DAYS = 7;                        // 임시저장 7일 보관
  const MAX_AGE = RETENTION_DAYS * 24 * 3600 * 1000;

  function read() {
    try {
      const d = JSON.parse(localStorage.getItem(K) || 'null');
      if (!d) return null;
      if (Date.now() - (d.t || 0) > MAX_AGE) { localStorage.removeItem(K); return null; }
      return d;
    } catch (_) { return null; }
  }
  function write(patch) {
    const cur = read() || {};
    const next = Object.assign({}, cur, patch, { t: Date.now() });
    try { localStorage.setItem(K, JSON.stringify(next)); } catch (_) {}
    return next;
  }
  function hasAnyMedia(d) {
    return !!(d && ((Array.isArray(d.images) && d.images.length) || d.video_url));
  }

  window.GALLA_WriteMedia = {
    get: read,
    hasMedia: () => hasAnyMedia(read()),
    setImages(urls) { write({ images: Array.isArray(urls) ? urls : [] }); },
    setVideo(url, name) { write({ video_url: url || null, video_name: name || null }); },
    clearVideo() { write({ video_url: null, video_name: null }); },
    setCardThumb(url) { write({ card_thumb_url: url || null }); },
    setStep(n) { write({ step: Number(n) || 1 }); },
    setMode(m) { write({ mode: m }); },
    clear() { try { localStorage.removeItem(K); } catch (_) {} },
    RETENTION_DAYS,
    savedAt() { const d = read(); return d ? (d.t || 0) : 0; },
    // 만료까지 남은 일수(올림). 저장본 없으면 0.
    daysLeft() { const d = read(); if (!d) return 0; return Math.max(0, Math.ceil((d.t + MAX_AGE - Date.now()) / (24 * 3600 * 1000))); },
  };

  /* ─────────────── 업로드 진행 오버레이 (인스타식 전체화면) ─────────────── */
  let root = null, fill = null, pctEl = null, labelEl = null, thumbImg = null, thumbVid = null, doneMark = null;

  function build() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'gUpOverlay';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <div class="gup-card">
        <div class="gup-thumb">
          <img class="gup-thumb-img" alt="">
          <video class="gup-thumb-vid" muted playsinline></video>
          <div class="gup-done">✓</div>
        </div>
        <div class="gup-label">업로드 중…</div>
        <div class="gup-track"><div class="gup-fill"></div></div>
        <div class="gup-pct">0%</div>
      </div>`;
    document.body.appendChild(root);
    fill = root.querySelector('.gup-fill');
    pctEl = root.querySelector('.gup-pct');
    labelEl = root.querySelector('.gup-label');
    thumbImg = root.querySelector('.gup-thumb-img');
    thumbVid = root.querySelector('.gup-thumb-vid');
    doneMark = root.querySelector('.gup-done');
    return root;
  }

  function setThumb(thumb) {
    build();
    // thumb: {imgUrl} | {videoUrl} | {file}
    thumbImg.style.display = 'none';
    thumbVid.style.display = 'none';
    doneMark.classList.remove('on');
    try {
      if (thumb && thumb.videoUrl) {
        thumbVid.src = thumb.videoUrl; thumbVid.style.display = ''; thumbVid.load();
      } else if (thumb && thumb.imgUrl) {
        thumbImg.src = thumb.imgUrl; thumbImg.style.display = '';
      } else if (thumb && thumb.file) {
        const u = URL.createObjectURL(thumb.file);
        if (/^video\//.test(thumb.file.type)) { thumbVid.src = u; thumbVid.style.display = ''; thumbVid.load(); }
        else { thumbImg.src = u; thumbImg.style.display = ''; }
      }
    } catch (_) {}
  }

  function setProgress(p) {
    build();
    const v = Math.max(0, Math.min(100, Math.round(p == null ? 0 : p)));
    fill.style.width = v + '%';
    pctEl.textContent = v + '%';
  }

  window.GALLA_UploadOverlay = {
    show(opts) {
      opts = opts || {};
      build();
      if (labelEl) labelEl.textContent = opts.label || '업로드 중…';
      setThumb(opts.thumb);
      setProgress(opts.progress || 0);
      // 리플로우 후 표시(트랜지션)
      root.classList.remove('done');
      requestAnimationFrame(() => root.classList.add('on'));
      document.body.classList.add('gup-lock');
    },
    label(t) { build(); if (labelEl) labelEl.textContent = t; },
    thumb(t) { setThumb(t); },
    progress: setProgress,
    // 완료 표시(체크) 후 살짝 뒤 자동 숨김
    done(label) {
      build();
      setProgress(100);
      if (labelEl) labelEl.textContent = label || '완료';
      root.classList.add('done');
      if (doneMark) doneMark.classList.add('on');
    },
    hide() {
      if (!root) return;
      root.classList.remove('on');
      document.body.classList.remove('gup-lock');
    },
    isOpen() { return !!(root && root.classList.contains('on')); },
  };

  /* ─────────────── 액션 시트 (인스타 '다시 시작/임시 저장/계속' 스타일) ───────────────
     GALLA_ActionSheet({ title, message, actions:[{label, style:'destructive'|'cancel', onClick}] }) */
  window.GALLA_ActionSheet = function (opts) {
    opts = opts || {};
    const wrap = document.createElement('div');
    wrap.className = 'gsheet';
    const btns = (opts.actions || []).map((a, i) =>
      `<button type="button" class="gsheet-btn ${a.style || ''}" data-i="${i}">${a.label || ''}</button>`
    ).join('');
    wrap.innerHTML = `
      <div class="gsheet-card" role="dialog" aria-modal="true">
        ${opts.title ? `<div class="gsheet-title">${opts.title}</div>` : ''}
        ${opts.message ? `<div class="gsheet-msg">${opts.message}</div>` : ''}
        <div class="gsheet-btns">${btns}</div>
      </div>`;
    document.body.appendChild(wrap);
    document.body.classList.add('gup-lock');
    requestAnimationFrame(() => wrap.classList.add('on'));

    function close() {
      wrap.classList.remove('on');
      document.body.classList.remove('gup-lock');
      setTimeout(() => { try { wrap.remove(); } catch (_) {} }, 220);
    }
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('.gsheet-btn');
      if (b) {
        const a = (opts.actions || [])[Number(b.dataset.i)];
        close();
        if (a && a.onClick) { try { a.onClick(); } catch (_) {} }
        return;
      }
      // 배경 탭 = 취소(계속 수정하기)
      if (e.target === wrap) close();
    });
    return { close };
  };
})();
