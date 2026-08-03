/* ============================================================
   갈라리 작성 — 진영 없는 일반 콘텐츠 (인스타식 세로/캐러셀 + 유튜브식 가로)
   · 미디어 파이프라인 재사용: GALLA_PROCESS_IMAGES(4:5 크롭)·GALLA_UPLOAD_MEDIA·
     GALLA_bgVideo(영상 배경 업로드)·GALLA_UploadOverlay(인스타식 진행 UI).
   · 영상 1분 제한(초기). posts 테이블에 insert.
   · 이중 모드 — MPA면 DOMContentLoaded, SPA면 로더가 캡처한 DCL로 실행.
   ============================================================ */
(function () {
  const MAX_VIDEO_SEC = 60;          // 초기 1분 제한
  const MAX_IMAGES = 10;

  function initGallariWrite(_pRoot, params) {
    const root = document.getElementById('app') || document;
    const $ = (id) => document.getElementById(id);
    const supa = () => window.supabaseClient;

    let KIND = 'vertical';           // 'vertical' | 'horizontal'
    // 🎠 숏판(세로) 혼합 미디어 — 이슈와 동일: [{kind:'image'|'video', file, url, thumb, up}] (순서=캐러셀, 첫=표지)
    let vItems = [];
    let hVideoFile = null, hVideoUrl = null;   // 롱판 가로영상
    let hThumbUrl = null, hVideoPoster = null, hCoverUp = false;   // 롱판 썸네일(따로) + 영상 포스터
    let preVideoUrl = null, preVideoThumb = null;   // 🎬 갈비스가 만든 사전호스팅 영상(R2 mp4) — 업로드 없이 그대로 발행

    const kindTabs = root.querySelectorAll('.glr-kind-tab');
    const O = () => window.GALLA_UploadOverlay;
    const MAX_VID_DUR = (window.GALLA_bgVideo && window.GALLA_bgVideo.MAX_DURATION) || MAX_VIDEO_SEC;

    /* ---------- 태그 파싱 ---------- */
    const parseTags = (v, ...texts) => {
      const out = [];
      const add = (x) => { if (x && !out.includes(x)) out.push(x); };
      String(v || '').split(/[\s,]+/).forEach(s => add(s.replace(/[^0-9A-Za-z가-힣_]/g, '').toLowerCase()));
      texts.forEach(t => (String(t || '').match(/#([0-9A-Za-z가-힣_]{1,30})/g) || [])
        .forEach(m => add(m.slice(1).toLowerCase())));
      return out.slice(0, 10);
    };

    /* ---------- 형태 전환 ---------- */
    function setKind(kind) {
      KIND = kind;
      kindTabs.forEach(t => t.classList.toggle('active', t.dataset.kind === kind));
      $('glr-vertical-media').hidden = kind !== 'vertical';
      $('glr-horizontal-media').hidden = kind !== 'horizontal';
      $('glr-title-block').hidden = kind !== 'horizontal';   // 제목은 가로형(유튜브식)만
      $('glrCapLabel').textContent = kind === 'horizontal' ? '설명' : '내용';
      $('glrHint').textContent = kind === 'horizontal'
        ? '🎬 롱판 — 가로 영상(16:9, 최대 1분). 유튜브처럼 제목·설명과 함께 몰입해서 봐요.'
        : '⚡ 숏판 — 세로영상 또는 사진(최대 10장 캐러셀). 릴스처럼 훅, 진영·배틀 없이 그냥 콘텐츠예요.';
      try { const _hd = document.querySelector('.wr-appbar-title'); if (_hd) _hd.textContent = (kind === 'horizontal' ? '롱판' : '숏판') + ' 만들기'; } catch (_) {}
    }
    kindTabs.forEach(t => t.addEventListener('click', () => setKind(t.dataset.kind)));

    /* ---------- 숏판(세로) 혼합 미디어: 사진+영상 캐러셀 (이슈와 동일 구조) ---------- */
    const mediaBtn = $('glrMediaBtn'), mediaInput = $('glrMedia'), mediaPrev = $('glrMediaPrev');

    /* 업로드 모드 — 🖼캐러셀 / 🎬영상+표지 (이슈 write와 동일). 영상 모드=영상1+표지(thumb) → 단일 영상 저장. */
    let vMode = 'carousel';
    const glrModeTabs = $('glrModeTabs'), glrCover = $('glrCover'),
      glrDropTitle = $('glrDropTitle'), glrDropSub = $('glrDropSub');
    function setVMode(mode, opts) {
      opts = opts || {};
      if (mode !== 'video' && mode !== 'carousel') return;
      if (mode === vMode && !opts.force) return;
      if (!opts.silent && vItems.length && mode !== vMode) {
        const keep = mode === 'video' ? (vItems.length === 1 && vItems[0].kind === 'video') : true;
        if (!keep) { if (!confirm('모드를 바꾸면 담은 미디어가 지워져요. 계속할까요?')) return; vItems = []; }
      }
      vMode = mode;
      if (glrModeTabs) glrModeTabs.querySelectorAll('.mm-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      if (mode === 'video') {
        mediaInput.setAttribute('accept', 'video/*'); mediaInput.removeAttribute('multiple');
        if (glrDropTitle) glrDropTitle.textContent = '영상 올리기';
        if (glrDropSub) glrDropSub.textContent = '영상 1개 · 썸네일은 따로 고를 수 있어요';
      } else {
        mediaInput.setAttribute('accept', 'image/*,video/*'); mediaInput.setAttribute('multiple', '');
        if (glrDropTitle) glrDropTitle.textContent = '사진·영상 올리기';
        if (glrDropSub) glrDropSub.textContent = '여러 개는 캐러셀로 넘겨서 노출 · 첫 항목이 표지';
      }
      renderVMedia();
    }
    if (glrModeTabs) glrModeTabs.addEventListener('click', e => { const t = e.target.closest('.mm-tab'); if (t) setVMode(t.dataset.mode); });
    if (glrCover) glrCover.addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0]; glrCover.value = '';
      const v = vItems[0]; if (!f || !v || v.kind !== 'video') return;
      v.coverCustom = true; v.coverUp = true; renderVMedia();
      try {
        let file = f;
        if (window.GALLA_PROCESS_IMAGES) { const pr = await window.GALLA_PROCESS_IMAGES([f]); if (pr && pr[0]) file = pr[0]; }
        if (window.GALLA_UPLOAD_MEDIA) { const u = await window.GALLA_UPLOAD_MEDIA(file, 'image'); if (u) v.thumb = u; else v.coverCustom = false; }
      } catch (err) { console.warn('[갈라리] 썸네일 업로드 실패', err); v.coverCustom = false; }
      finally { v.coverUp = false; renderVMedia(); }
    });

    function vSrc(it) { return it.kind === 'video' ? (it.thumb || '') : (it.url || (it.file ? URL.createObjectURL(it.file) : '')); }
    function renderVMedia() {
      // 🎬 영상 모드 — 비어있어도 항상 '영상 슬롯 / 썸네일 슬롯' 두 개(각각 독립 선택)
      if (vMode === 'video') {
        if (mediaBtn) mediaBtn.style.display = 'none';
        const v = vItems[0];
        const hasVid = !!(v && v.kind === 'video');
        const poster = hasVid ? (v.poster || v.thumb || '') : '';
        const custom = !!(hasVid && v.coverCustom && v.thumb);
        mediaPrev.innerHTML = `
          <div class="vmode-slots">
            <div class="vmode-slot">
              <div class="vmode-slot-h">🎬 영상 <em class="req">필수</em></div>
              ${hasVid
                ? `<div class="vmode-thumb is-video${v.up ? ' uploading' : ''}">
                     ${poster ? `<img src="${poster}">` : `<div class="mi-vidph">🎬</div>`}<span class="multi-img-play">▶</span>
                     ${v.up ? '<span class="multi-img-up"><i></i></span>' : ''}
                     <button type="button" class="vmode-del" data-del="video" aria-label="영상 삭제">✕</button>
                   </div>`
                : `<button type="button" class="vmode-pick" id="glrPickVideo"><span class="vmode-plus">＋</span><span>영상 선택</span></button>`}
            </div>
            <div class="vmode-slot">
              <div class="vmode-slot-h">🖼 썸네일 <em class="opt">선택</em></div>
              ${custom
                ? `<div class="vmode-thumb${v.coverUp ? ' uploading' : ''}">
                     <img src="${v.thumb}">
                     ${v.coverUp ? '<span class="multi-img-up"><i></i></span>' : ''}
                     <button type="button" class="vmode-del" data-del="cover" aria-label="썸네일 삭제">✕</button>
                   </div>`
                : `<button type="button" class="vmode-pick vmode-pick--cover" id="glrPickCover" ${hasVid ? '' : 'disabled'}><span class="vmode-plus">＋</span><span>썸네일 선택</span><em>안 고르면 첫 장면</em></button>`}
            </div>
          </div>
          <div class="guide-text">영상 필수 · 썸네일은 선택(안 고르면 영상 첫 장면) · 피드에선 <b>영상만</b> 재생</div>`;
        return;
      }
      if (!vItems.length) { mediaPrev.innerHTML = ''; if (mediaBtn) mediaBtn.style.display = ''; return; }
      if (mediaBtn) mediaBtn.style.display = 'none';
      mediaPrev.innerHTML = `<div class="multi-img-strip">${vItems.map((it, i) => `
        <div class="multi-img-item${it.up ? ' uploading' : ''}${it.kind === 'video' ? ' is-video' : ''}">
          ${it.kind === 'video' ? (it.thumb ? `<img src="${it.thumb}">` : `<div class="mi-vidph">🎬</div>`) + `<span class="multi-img-play">▶</span>` : `<img src="${vSrc(it)}">`}
          ${it.up ? '<span class="multi-img-up"><i></i></span>' : ''}
          ${i === 0 ? '<span class="multi-img-badge">표지</span>' : '<span class="multi-img-num">' + (i + 1) + '</span>'}
          <button type="button" class="multi-img-del" data-idx="${i}" aria-label="삭제">✕</button>
          ${vItems.length > 1 ? `<div class="multi-img-move">
            <button type="button" class="mim-mv" data-mv="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="앞으로">‹</button>
            <button type="button" class="mim-mv" data-mv="${i}" data-dir="1" ${i === vItems.length - 1 ? 'disabled' : ''} aria-label="뒤로">›</button>
          </div>` : ''}
        </div>`).join('')}
        ${vItems.length < MAX_IMAGES ? '<button type="button" class="multi-img-add" aria-label="추가">＋</button>' : ''}
      </div><div class="guide-text">${vItems.length}/${MAX_IMAGES} · 첫 항목이 표지 · ‹ ›로 순서 변경${vItems.length > 1 ? ' · 캐러셀로 노출' : ''}</div>`;
    }
    async function uploadVImage(it) {
      if (!it.file || it.url) return;
      it.up = true;
      try { if (window.GALLA_UPLOAD_MEDIA) it.url = await window.GALLA_UPLOAD_MEDIA(it.file, 'image'); }
      catch (e) { console.warn('[갈라리] 사진 업로드 실패', e); }
      finally { it.up = false; renderVMedia(); }
    }
    async function uploadVVideo(it) {
      if (!it.file || it.url) return;
      it.up = true; renderVMedia();
      try {
        const up = window.GALLA_UPLOAD_VIDEO || window.GALLA_UPLOAD_VIDEO_STREAM;
        if (up) {
          const out = await up(it.file);
          it.url = out.url || out.hls;
          it.poster = out.thumbnail || it.poster || null;
          if (!it.coverCustom) it.thumb = it.poster;
        }
      }
      catch (e) { console.warn('[갈라리] 영상 업로드 실패', e); }
      finally { it.up = false; renderVMedia(); }
    }
    async function addVMedia(files) {
      files = [...(files || [])].filter(Boolean);
      if (!files.length) return;
      // 🎬 영상 모드 — 영상 1개만(기존 것 교체). 표지는 glrCover로 따로.
      if (vMode === 'video') {
        const vf = files.find(f => /^video\//.test(f.type));
        if (!vf) { alert('영상 파일을 선택해주세요.'); return; }
        const dur = await videoDuration(vf);
        if (dur && dur > MAX_VID_DUR + 1) { alert(`영상이 너무 길어요 (${Math.round(dur)}초) — 최대 ${MAX_VID_DUR}초까지예요.`); return; }
        const it = { kind: 'video', file: vf, url: null, thumb: null, up: true };
        vItems = [it]; renderVMedia(); uploadVVideo(it);
        return;
      }
      let room = MAX_IMAGES - vItems.length;
      if (room <= 0) { alert(`미디어는 최대 ${MAX_IMAGES}개예요.`); return; }
      if (files.length > room) files = files.slice(0, room);
      const imgFiles = files.filter(f => /^image\//.test(f.type));
      let processed = imgFiles;
      if (imgFiles.length) { try { processed = window.GALLA_PROCESS_IMAGES ? (await window.GALLA_PROCESS_IMAGES(imgFiles) || imgFiles) : imgFiles; } catch (e) { processed = imgFiles; } }
      let pi = 0; const added = [];
      for (const f of files) {
        if (vItems.length + added.length >= MAX_IMAGES) break;
        if (/^video\//.test(f.type)) {
          const dur = await videoDuration(f);
          if (dur && dur > MAX_VID_DUR + 1) { alert(`영상이 너무 길어요 (${Math.round(dur)}초) — 최대 ${MAX_VID_DUR}초까지예요.`); continue; }
          added.push({ kind: 'video', file: f, url: null, thumb: null, up: true });
        } else if (/^image\//.test(f.type)) {
          added.push({ kind: 'image', file: processed[pi++] || f, url: null, thumb: null, up: true });
        }
      }
      if (added.length) { vItems = vItems.concat(added); renderVMedia(); added.forEach(it => it.kind === 'video' ? uploadVVideo(it) : uploadVImage(it)); }
    }
    mediaInput.addEventListener('click', () => { mediaInput.value = ''; });
    mediaInput.addEventListener('change', e => addVMedia(e.target.files));
    mediaPrev.addEventListener('click', e => {
      const del = e.target.closest('.multi-img-del');
      if (del) { vItems.splice(Number(del.dataset.idx), 1); renderVMedia(); return; }
      const mv = e.target.closest('.mim-mv');
      if (mv) {
        const i = Number(mv.dataset.mv), j = i + Number(mv.dataset.dir);
        if (j >= 0 && j < vItems.length) { const t = vItems[i]; vItems[i] = vItems[j]; vItems[j] = t; renderVMedia(); }
        return;
      }
      if (e.target.closest('#glrPickVideo')) { mediaInput.value = ''; mediaInput.click(); return; }
      const vdel = e.target.closest('.vmode-del');
      if (vdel) {
        const v = vItems[0];
        if (vdel.dataset.del === 'cover') { if (v) { v.coverCustom = false; v.thumb = v.poster || null; } }
        else { vItems = []; }
        renderVMedia(); return;
      }
      if (e.target.closest('.multi-img-add')) { mediaInput.value = ''; mediaInput.click(); return; }
      if (e.target.closest('#glrPickCover')) { if (glrCover) { glrCover.value = ''; glrCover.click(); } return; }
    });

    /* ---------- 영상 공용 (세로/가로) ---------- */
    function videoDuration(file) {
      return new Promise((res) => {
        const url = URL.createObjectURL(file);
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => { URL.revokeObjectURL(url); res(v.duration || 0); };
        v.onerror = () => { URL.revokeObjectURL(url); res(0); };
        setTimeout(() => res(0), 8000);
        v.src = url;
      });
    }
    async function pickVideo(file, prevBox) {
      prevBox.innerHTML = '';
      const dur = await videoDuration(file);
      if (dur && dur > MAX_VIDEO_SEC + 1) {
        prevBox.innerHTML = `<div class="glr-vbar err">⚠️ 영상이 너무 길어요 (${Math.round(dur)}초) — 최대 ${MAX_VIDEO_SEC}초까지예요.</div>`;
        return false;
      }
      const vid = document.createElement('video');
      vid.src = URL.createObjectURL(file); vid.controls = true; vid.playsInline = true; vid.muted = true;
      prevBox.appendChild(vid);
      const bar = document.createElement('div'); bar.className = 'glr-vbar'; bar.textContent = '⬆️ 미리 올리는 중…';
      prevBox.appendChild(bar);
      // 배경 업로드(있으면) — 발행 때 이어받아 즉시
      if (window.GALLA_bgVideo) {
        const r = await window.GALLA_bgVideo.pick(file);
        if (!r.ok) { bar.className = 'glr-vbar err'; bar.textContent = '⚠️ 영상을 읽지 못했어요.'; return false; }
        const tick = setInterval(() => {
          const done = window.GALLA_bgVideo.isDone();
          bar.textContent = done ? '✅ 준비 완료' : `⬆️ 미리 올리는 중… ${window.GALLA_bgVideo.progress()}%`;
          if (done) clearInterval(tick);
        }, 400);
      } else { bar.textContent = '선택됨'; }
      return true;
    }
    // (세로영상은 위 숏판 혼합 미디어에서 함께 처리 — 별도 핸들러 없음)
    // 가로영상(롱판) — 영상 슬롯 / 썸네일 슬롯 '따로' 두 개
    const hv = $('glrHVideo'), hCover = $('glrHCover'), hPrev = $('glrHPrev');
    function captureVideoPoster(file) {
      return new Promise(res => {
        try {
          const v = document.createElement('video'); v.muted = true; v.preload = 'metadata';
          const u = URL.createObjectURL(file);
          v.onloadeddata = () => { try { v.currentTime = Math.min(0.1, (v.duration || 1) * 0.1); } catch (_) {} };
          v.onseeked = () => {
            try { const c = document.createElement('canvas'); c.width = v.videoWidth || 320; c.height = v.videoHeight || 180; c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.7)); }
            catch (_) { res(null); } finally { URL.revokeObjectURL(u); }
          };
          v.onerror = () => { res(null); URL.revokeObjectURL(u); };
          v.src = u; setTimeout(() => res(null), 4000);
        } catch (_) { res(null); }
      });
    }
    function renderHMedia() {
      if (!hPrev) return;
      const hasVid = !!(hVideoFile || preVideoUrl);
      const custom = !!hThumbUrl;
      const vposter = hVideoPoster || preVideoThumb || '';
      hPrev.innerHTML = `
        <div class="vmode-slots">
          <div class="vmode-slot">
            <div class="vmode-slot-h">🎬 가로영상 <em class="req">필수</em></div>
            ${hasVid
              ? `<div class="vmode-thumb is-video vmode-thumb--wide">${vposter ? `<img src="${vposter}">` : `<div class="mi-vidph">🎬</div>`}<span class="multi-img-play">▶</span><button type="button" class="vmode-del" data-del="hvideo" aria-label="영상 삭제">✕</button></div>`
              : `<button type="button" class="vmode-pick vmode-pick--wide" id="glrPickHVideo"><span class="vmode-plus">＋</span><span>영상 선택</span></button>`}
          </div>
          <div class="vmode-slot">
            <div class="vmode-slot-h">🖼 썸네일 <em class="opt">선택</em></div>
            ${custom
              ? `<div class="vmode-thumb vmode-thumb--wide${hCoverUp ? ' uploading' : ''}"><img src="${hThumbUrl}">${hCoverUp ? '<span class="multi-img-up"><i></i></span>' : ''}<button type="button" class="vmode-del" data-del="hcover" aria-label="썸네일 삭제">✕</button></div>`
              : `<button type="button" class="vmode-pick vmode-pick--cover vmode-pick--wide" id="glrPickHCover" ${hasVid ? '' : 'disabled'}><span class="vmode-plus">＋</span><span>썸네일 선택</span><em>안 고르면 첫 장면</em></button>`}
          </div>
        </div>
        <div class="guide-text">가로 16:9 권장 · 영상 필수 · 썸네일 선택(안 고르면 영상 첫 장면)</div>`;
    }
    hv.addEventListener('change', async e => {
      const f = e.target.files[0]; hv.value = ''; if (!f) return;
      const dur = await videoDuration(f);
      if (dur && dur > MAX_VIDEO_SEC + 1) { alert(`영상이 너무 길어요 (${Math.round(dur)}초) — 최대 ${MAX_VIDEO_SEC}초까지예요.`); return; }
      window.GALLA_bgVideo && window.GALLA_bgVideo.clear();
      hVideoFile = f; hVideoUrl = null; preVideoUrl = null; preVideoThumb = null; hVideoPoster = null;
      renderHMedia();
      captureVideoPoster(f).then(p => { hVideoPoster = p; renderHMedia(); });
      if (window.GALLA_bgVideo) { try { await window.GALLA_bgVideo.pick(f); } catch (_) {} }
    });
    if (hCover) hCover.addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0]; hCover.value = ''; if (!f) return;
      hCoverUp = true; renderHMedia();
      try {
        let file = f;
        if (window.GALLA_PROCESS_IMAGES) { const pr = await window.GALLA_PROCESS_IMAGES([f]); if (pr && pr[0]) file = pr[0]; }
        if (window.GALLA_UPLOAD_MEDIA) { const u = await window.GALLA_UPLOAD_MEDIA(file, 'image'); if (u) hThumbUrl = u; }
      } catch (err) { console.warn('[갈라리] 롱판 썸네일 업로드 실패', err); }
      finally { hCoverUp = false; renderHMedia(); }
    });
    if (hPrev) hPrev.addEventListener('click', e => {
      if (e.target.closest('#glrPickHVideo')) { hv.value = ''; hv.click(); return; }
      if (e.target.closest('#glrPickHCover')) { if (hCover) { hCover.value = ''; hCover.click(); } return; }
      const vdel = e.target.closest('.vmode-del');
      if (vdel) {
        if (vdel.dataset.del === 'hcover') { hThumbUrl = null; }
        else { hVideoFile = null; hVideoUrl = null; hVideoPoster = null; preVideoUrl = null; preVideoThumb = null; try { window.GALLA_bgVideo && window.GALLA_bgVideo.clear(); } catch (_) {} }
        renderHMedia(); return;
      }
    });
    renderHMedia();

    /* ---------- 발행 ---------- */
    const submitBtn = $('glrSubmit');
    submitBtn.addEventListener('click', async () => {
      const sb = supa();
      if (!sb) { alert('연결 오류'); return; }
      const { data: sess } = await sb.auth.getSession();
      const me = sess?.session?.user?.id;
      if (!me) { alert('로그인이 필요해요.'); return; }

      const title = ($('glrTitle').value || '').trim();
      const caption = ($('glrCaption').value || '').trim();
      const tags = parseTags($('glrTags').value, title, caption);

      // 검증
      const isH = KIND === 'horizontal';
      const videoFile = isH ? hVideoFile : null;      // 롱판만 단독 영상 파일. 숏판은 vItems 혼합.
      const hasVMedia = !isH && vItems.length > 0;    // 숏판 혼합 미디어
      if (isH && !title) { alert('제목을 입력해주세요.'); return; }
      if (isH) { if (!videoFile && !preVideoUrl) { alert('가로 영상을 올려주세요.'); return; } }
      else { if (!hasVMedia) { alert('사진이나 영상을 1개 이상 올려주세요.'); return; } }

      // 발행 전 자동 모더레이션(check-issue 재사용) — 위험 표현은 업로드 전에 빠르게 차단.
      let modStatus = 'ok';
      if (title || caption) {
        try {
          submitBtn.disabled = true; submitBtn.textContent = '검사 중…';
          const { data: chk } = await sb.functions.invoke('check-issue', { body: { title, description: caption } });
          if (chk && chk.risk_level === '위험') {
            submitBtn.disabled = false; submitBtn.textContent = '공유';
            alert('커뮤니티 기준에 맞지 않는 표현이 감지됐어요. 내용을 다듬어 다시 올려주세요.');
            return;
          }
        } catch (_) { modStatus = 'pending'; }   // 검사 실패는 발행을 막지 않되 검토 대기(pending)
      }

      let images = null, video_url = null, thumbnail_url = null, media = null;
      const pending = isH ? null : vItems.find(it => !it.url && it.file);
      const needUp = isH ? !!videoFile : !!pending;
      try {
        submitBtn.disabled = true; submitBtn.textContent = '올리는 중…';
        if (needUp && O()) O().show({ label: '올리는 중…', thumb: isH ? { file: videoFile } : { file: pending.file } });

        if (isH) {
          // 롱판 — 단일 가로영상(또는 갈비스 사전영상)
          if (preVideoUrl) { video_url = preVideoUrl; if (preVideoThumb) thumbnail_url = preVideoThumb; }
          else if (videoFile) {
            if (O() && needUp) { O().thumb({ file: videoFile }); O().label('영상 올리는 중…'); }
            const onP = p => { if (O() && needUp) O().progress(p == null ? 0 : p); };
            const out = window.GALLA_bgVideo ? await window.GALLA_bgVideo.result(videoFile, onP) : await window.GALLA_UPLOAD_VIDEO(videoFile, onP);
            video_url = (out && (out.url || out.hls)) || null;
            if (out && out.thumbnail) thumbnail_url = out.thumbnail;
          }
          if (hThumbUrl) thumbnail_url = hThumbUrl;   // 롱판 커스텀 썸네일 우선
        } else {
          // 🎠 숏판 — 혼합 캐러셀(사진+영상). 순서대로 업로드 → media[] + 하위호환 필드.
          media = []; const imgUrls = []; let firstVideoUrl = null; const total = vItems.length;
          for (let i = 0; i < vItems.length; i++) {
            const it = vItems[i];
            if (!it.url && it.file) {
              if (O() && needUp) { O().thumb({ file: it.file }); O().label(`올리는 중… (${i + 1}/${total})`); }
              const onP = p => { if (O() && needUp) O().progress(p == null ? 0 : p); };
              if (it.kind === 'video') { const up = window.GALLA_UPLOAD_VIDEO || window.GALLA_UPLOAD_VIDEO_STREAM; const out = await up(it.file, onP); it.url = out.url || out.hls; it.thumb = it.thumb || out.thumbnail || null; }
              else { it.url = await window.GALLA_UPLOAD_MEDIA(it.file, 'image', onP); }
            }
            if (!it.url) continue;
            media.push({ type: it.kind, url: it.url, thumb: it.thumb || null });
            if (it.kind === 'image') imgUrls.push(it.url); else if (!firstVideoUrl) firstVideoUrl = it.url;
          }
          images = imgUrls.length ? imgUrls : null;
          video_url = firstVideoUrl;
          const c0 = vItems[0];
          thumbnail_url = c0 ? (c0.kind === 'video' ? (c0.thumb || null) : c0.url) : null;
          if (!media.length) media = null;
        }
        if (O() && needUp) { O().done('완료'); await new Promise(r => setTimeout(r, 420)); O().hide(); }
      } catch (err) {
        console.error('[갈라리 업로드]', err);
        try { O() && O().hide(); } catch (_) {}
        alert('업로드에 실패했어요. 잠시 후 다시 시도해주세요.');
        submitBtn.disabled = false; submitBtn.textContent = '공유';
        return;
      }

      const payload = {
        user_id: me,
        kind: KIND,
        title: isH ? title : (title || null),
        caption: caption || null,
        images: isH ? null : images,
        media: isH ? null : media,   // 🎠 숏판 혼합 캐러셀
        video_url,
        thumbnail_url,
        tags: tags.length ? tags : null,
        is_published: true,
        moderation_status: modStatus,
      };
      const { error } = await sb.from('posts').insert(payload).select('id').single();
      submitBtn.disabled = false; submitBtn.textContent = '공유';
      if (error) { console.error('[갈라리 insert]', error); alert('올리기에 실패했어요.'); return; }

      try { window.GALLA_toast && window.GALLA_toast((KIND === 'horizontal' ? '롱판' : '숏판') + '에 올렸어요'); } catch (_) {}
      // 올린 뒤 피드로 — 작성 스택은 닫고 갈라리 피드로 이동
      const goFeed = () => (window.GALLA_nav || function (u) { location.href = u; })('gallari.html');
      if (document.body.dataset.page === 'spa' && window.GALLA_SPA && window.GALLA_SPA.pop) { try { window.GALLA_SPA.pop(); } catch (_) {} setTimeout(goFeed, 60); }
      else goFeed();
    });

    setKind('vertical');

    // 진입 형식 프리셋 — 숏판(vertical)/롱판(horizontal). SPA params 또는 URL ?kind=
    try {
      let wantKind = params && params.kind;
      if (!wantKind) { try { wantKind = new URLSearchParams(location.search).get('kind'); } catch (_) {} }
      if (wantKind === 'horizontal') setKind('horizontal');
    } catch (_) {}

    /* 🤖 갈비스 초안 프리필 + 🛠 작업모드 브리지 — 갈비스 도킹 미니챗이 갈라리 폼(캡션·태그·제목)을 실시간 수정.
       미디어(사진·영상)는 상대가 직접. */
    (function () {
      const cap = $('glrCaption'), tit = $('glrTitle'), tg = $('glrTags');
      let seed = null; try { seed = JSON.parse(sessionStorage.getItem('GALLA_SEED') || 'null'); } catch (_) {}
      if (seed && seed.from === 'jarvis' && seed.kind === 'gallari') {
        try { sessionStorage.removeItem('GALLA_SEED'); } catch (_) {}
        setKind(seed.vkind === 'horizontal' ? 'horizontal' : 'vertical');
        if (cap && !cap.value) cap.value = seed.caption || '';
        if (tit && seed.title && !tit.value) tit.value = seed.title;
        if (tg && Array.isArray(seed.tags) && seed.tags.length && !tg.value) tg.value = seed.tags.map(t => '#' + t).join(' ');
      }
      const setVal = (elm, v) => { if (elm == null || v == null) return; elm.value = String(v); try { elm.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {} };
      window.GALLA_WORKFORM = {
        type: 'gallari',
        getFields() { return { vkind: KIND, title: tit ? tit.value : '', caption: cap ? cap.value : '', tags: tg ? (window.GALLA_parseTagInput ? window.GALLA_parseTagInput(tg.value) : tg.value) : [] }; },
        setFields(f) {
          if (!f) return;
          if (f.vkind) setKind(f.vkind === 'horizontal' ? 'horizontal' : 'vertical');
          if ('title' in f) setVal(tit, f.title);
          if ('caption' in f) setVal(cap, f.caption);
          if ('tags' in f) { const arr = Array.isArray(f.tags) ? f.tags : String(f.tags || '').split(/[\s,]+/); setVal(tg, arr.filter(Boolean).map(t => '#' + String(t).replace(/^#/, '')).join(' ')); }
        },
        // 🖼 갈비스 AI 썸네일 → 숏판 미디어 첫 항목(표지)으로 추가
        setThumbnail(url) {
          if (!url) return;
          setKind('vertical');
          if (vItems.some(it => it.url === url)) return;
          vItems.unshift({ kind: 'image', file: null, url: url, thumb: null, up: false });
          if (vItems.length > MAX_IMAGES) vItems = vItems.slice(0, MAX_IMAGES);
          renderVMedia();
        },
        // 이미 올린 사진 URL들(영상 소재로)
        getPhotos() { return vItems.filter(it => it.kind === 'image' && it.url).map(it => it.url); },
        // 🎬 갈비스가 만든 mp4(R2) → 사전호스팅 영상 세팅(업로드 없이 발행). vk: vertical|horizontal
        setVideo(url, thumb, vk) {
          if (!url) return;
          const horiz = vk === 'horizontal';
          setKind(horiz ? 'horizontal' : 'vertical');
          if (horiz) {
            preVideoUrl = url; preVideoThumb = thumb || null; hVideoFile = null; hVideoPoster = thumb || null;
            renderHMedia();
          } else {
            // 숏판 — 혼합 캐러셀 첫 항목(영상)으로 추가
            if (!vItems.some(it => it.url === url)) vItems.unshift({ kind: 'video', file: null, url: url, thumb: thumb || null, up: false });
            renderVMedia();
          }
        },
        submit() { const b = document.getElementById('glrSubmit'); b && b.click(); },
        summary() { return '캡션:' + String((cap && cap.value) || '-').slice(0, 30); }
      };
    })();
  }

  // 이중 모드 — MPA(단독 문서)는 자동 초기화 / SPA(app.html)는 어댑터가 mount 호출(중복 init 방지).
  //   ⚠️ 예전엔 SPA도 auto-init(아래)에 의존했으나, gallari-write만 전용 어댑터가 없어 라우터
  //      loadPageScripts 폴백+auto-init에 기대다 네이티브서 리스너·WORKFORM 배선이 불안정했다.
  //      → predict-market 방식(SPA는 어댑터 mount만)으로 통일해 결정적으로 초기화.
  window.GALLA_PAGE_GALLARI_WRITE = {
    init: initGallariWrite,
    mount(root, params) { return initGallariWrite(root, params); },
    unmount() { try { if (window.GALLA_WORKFORM && window.GALLA_WORKFORM.type === 'gallari') window.GALLA_WORKFORM = null; } catch (_) {} },
  };
  if (!(document.body && document.body.dataset.page === 'spa')) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initGallariWrite);
    else initGallariWrite();
  }
})();
