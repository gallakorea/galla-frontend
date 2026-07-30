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

  function initGallariWrite() {
    const root = document.getElementById('app') || document;
    const $ = (id) => document.getElementById(id);
    const supa = () => window.supabaseClient;

    let KIND = 'vertical';           // 'vertical' | 'horizontal'
    let VMODE = 'photo';             // 세로형 미디어: 'photo' | 'video'
    let imgItems = [];               // [{file,url,up}]  (세로 사진)
    let vVideoFile = null, vVideoUrl = null;   // 세로영상
    let hVideoFile = null, hVideoUrl = null;   // 가로영상

    const kindTabs = root.querySelectorAll('.glr-kind-tab');
    const mediaTabs = root.querySelectorAll('#glr-vertical-media .media-tab');
    const O = () => window.GALLA_UploadOverlay;

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
        ? '가로 영상 한 편(16:9, 최대 1분). 유튜브처럼 제목·설명과 함께 올려요.'
        : '사진(최대 10장 캐러셀) 또는 세로 영상 한 편. 진영·배틀 없이 그냥 콘텐츠예요.';
    }
    kindTabs.forEach(t => t.addEventListener('click', () => setKind(t.dataset.kind)));

    /* ---------- 세로형: 사진/영상 탭 ---------- */
    function setVMode(mode) {
      VMODE = mode;
      mediaTabs.forEach(t => t.classList.toggle('active', t.dataset.media === mode));
      $('glr-pane-photo').hidden = mode !== 'photo';
      $('glr-pane-video').hidden = mode !== 'video';
    }
    mediaTabs.forEach(t => t.addEventListener('click', () => setVMode(t.dataset.media)));

    /* ---------- 사진 (즉시 업로드 + 캐러셀 스트립) ---------- */
    const photoBtn = $('glrPhotoBtn'), photoInput = $('glrPhoto'), photoPrev = $('glrPhotoPrev');
    function renderPhotos() {
      if (!imgItems.length) { photoPrev.innerHTML = ''; if (photoBtn) photoBtn.style.display = ''; return; }
      if (photoBtn) photoBtn.style.display = 'none';
      photoPrev.innerHTML = `<div class="multi-img-strip">${imgItems.map((it, i) => `
        <div class="multi-img-item${it.up ? ' uploading' : ''}">
          <img src="${it.url || (it.file ? URL.createObjectURL(it.file) : '')}">
          ${it.up ? '<span class="multi-img-up"><i></i></span>' : ''}
          ${i === 0 ? '<span class="multi-img-badge">대표</span>' : ''}
          <button type="button" class="multi-img-del" data-idx="${i}" aria-label="삭제">✕</button>
        </div>`).join('')}
        ${imgItems.length < MAX_IMAGES ? '<button type="button" class="multi-img-add" aria-label="추가">＋</button>' : ''}
      </div><div class="guide-text">${imgItems.length}/${MAX_IMAGES}장 · 첫 장이 대표</div>`;
    }
    async function uploadPhoto(it) {
      if (!it.file || it.url) return;
      it.up = true;
      try { if (window.GALLA_UPLOAD_MEDIA) it.url = await window.GALLA_UPLOAD_MEDIA(it.file, 'image'); }
      catch (e) { console.warn('[갈라리] 사진 업로드 실패', e); }
      finally { it.up = false; renderPhotos(); }
    }
    async function addPhotos(files) {
      files = [...(files || [])].filter(Boolean);
      if (!files.length) return;
      const room = MAX_IMAGES - imgItems.length;
      if (room <= 0) { alert(`사진은 최대 ${MAX_IMAGES}장이에요.`); return; }
      files = files.slice(0, room);
      let processed;
      try { processed = window.GALLA_PROCESS_IMAGES ? await window.GALLA_PROCESS_IMAGES(files) : files; }
      catch (e) { processed = files; }
      const added = processed.map(f => ({ file: f, url: null, up: true }));
      imgItems = imgItems.concat(added);
      renderPhotos();
      added.forEach(uploadPhoto);
    }
    photoInput.addEventListener('click', () => { photoInput.value = ''; });
    photoInput.addEventListener('change', e => addPhotos(e.target.files));
    photoPrev.addEventListener('click', e => {
      const del = e.target.closest('.multi-img-del');
      if (del) { imgItems.splice(Number(del.dataset.idx), 1); renderPhotos(); return; }
      if (e.target.closest('.multi-img-add')) { photoInput.value = ''; photoInput.click(); }
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
    // 세로영상
    const vv = $('glrVVideo'), vvBtn = $('glrVVideoBtn'), vvPrev = $('glrVVideoPrev');
    vv.addEventListener('click', () => { vv.value = ''; });
    vv.addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      window.GALLA_bgVideo && window.GALLA_bgVideo.clear();
      const ok = await pickVideo(f, vvPrev);
      if (ok) { vVideoFile = f; vVideoUrl = null; if (vvBtn) vvBtn.style.display = 'none'; }
      else { vVideoFile = null; if (vvBtn) vvBtn.style.display = ''; }
    });
    // 가로영상
    const hv = $('glrHVideo'), hvBtn = $('glrHVideoBtn'), hvPrev = $('glrHVideoPrev');
    hv.addEventListener('click', () => { hv.value = ''; });
    hv.addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      window.GALLA_bgVideo && window.GALLA_bgVideo.clear();
      const ok = await pickVideo(f, hvPrev);
      if (ok) { hVideoFile = f; hVideoUrl = null; if (hvBtn) hvBtn.style.display = 'none'; }
      else { hVideoFile = null; if (hvBtn) hvBtn.style.display = ''; }
    });

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
      const videoFile = KIND === 'horizontal' ? hVideoFile : (VMODE === 'video' ? vVideoFile : null);
      const hasPhoto = KIND === 'vertical' && VMODE === 'photo' && imgItems.length > 0;
      if (KIND === 'horizontal' && !title) { alert('제목을 입력해주세요.'); return; }
      if (!videoFile && !hasPhoto) { alert(KIND === 'horizontal' ? '가로 영상을 올려주세요.' : (VMODE === 'video' ? '세로 영상을 올려주세요.' : '사진을 1장 이상 올려주세요.')); return; }

      let images = null, video_url = null, thumbnail_url = null;
      const needUp = (hasPhoto && imgItems.some(it => !it.url)) || !!videoFile;
      try {
        submitBtn.disabled = true; submitBtn.textContent = '올리는 중…';
        if (needUp && O()) O().show({ label: '올리는 중…', thumb: videoFile ? { file: videoFile } : { file: imgItems[0].file } });

        if (hasPhoto) {
          images = [];
          for (let i = 0; i < imgItems.length; i++) {
            const it = imgItems[i];
            if (it.url) { images.push(it.url); continue; }
            if (O() && needUp) { O().thumb({ file: it.file }); O().label(`사진 올리는 중… (${i + 1}/${imgItems.length})`); }
            const u = await window.GALLA_UPLOAD_MEDIA(it.file, 'image', p => { if (O() && needUp) O().progress(p == null ? 0 : p); });
            it.url = u; images.push(u);
          }
          thumbnail_url = images[0];
        }
        if (videoFile) {
          if (O() && needUp) { O().thumb({ file: videoFile }); O().label('영상 올리는 중…'); }
          const onP = p => { if (O() && needUp) O().progress(p == null ? 0 : p); };
          const out = window.GALLA_bgVideo ? await window.GALLA_bgVideo.result(videoFile, onP) : await window.GALLA_UPLOAD_VIDEO(videoFile, onP);
          video_url = (out && (out.url || out.hls)) || null;
          if (out && out.thumbnail) thumbnail_url = out.thumbnail;
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
        title: KIND === 'horizontal' ? title : (title || null),
        caption: caption || null,
        images: (KIND === 'vertical' && VMODE === 'photo') ? images : null,
        video_url,
        thumbnail_url,
        tags: tags.length ? tags : null,
        is_published: true,
        moderation_status: 'pending',
      };
      const { error } = await sb.from('posts').insert(payload).select('id').single();
      submitBtn.disabled = false; submitBtn.textContent = '공유';
      if (error) { console.error('[갈라리 insert]', error); alert('올리기에 실패했어요.'); return; }

      try { window.GALLA_toast && window.GALLA_toast('갈라리에 올렸어요'); } catch (_) {}
      // 올린 뒤 피드로 — 작성 스택은 닫고 갈라리 피드로 이동
      const goFeed = () => (window.GALLA_nav || function (u) { location.href = u; })('gallari.html');
      if (document.body.dataset.page === 'spa' && window.GALLA_SPA && window.GALLA_SPA.pop) { try { window.GALLA_SPA.pop(); } catch (_) {} setTimeout(goFeed, 60); }
      else goFeed();
    });

    setKind('vertical'); setVMode('photo');
  }

  // 이중 모드
  window.GALLA_PAGE_GALLARI_WRITE = { init: initGallariWrite };
  if (document.body && document.body.dataset.page === 'spa') {
    // SPA: 로더가 DCL을 캡처해 부름(아래 DCL 리스너) — 별도 mount 훅 없이 동작
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initGallariWrite);
  else initGallariWrite();
})();
