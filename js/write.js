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
    } else if (seed && seed.from === 'jarvis') {
      // 🤖 갈라비스 초안 프리필(제목·한줄·본문·카테고리)
      sessionStorage.removeItem('GALLA_SEED');
      if (titleEl && !titleEl.value) titleEl.value = seed.title || '';
      if (oneLineEl && !oneLineEl.value) oneLineEl.value = seed.oneLine || '';
      if (descEl && !descEl.value) descEl.value = seed.description || '';
      if (categoryEl && seed.category && !categoryEl.value) {
        try { categoryEl.value = seed.category; } catch (_) {}
      }
      // ⚔️ 갈비스 초안 — 진영(찬/반) 라벨까지 프리필
      const fA = document.getElementById('factionA'), fB = document.getElementById('factionB');
      if (fA && seed.factionA && !fA.value) fA.value = seed.factionA;
      if (fB && seed.factionB && !fB.value) fB.value = seed.factionB;
    }
  } catch (_) {}

  /* 🛠 작업 모드 브리지 — 갈비스 도킹 미니챗이 이 이슈 폼을 '알고' 실시간으로 필드를 고칠 수 있게 노출.
     ("제목 더 자극적으로", "본문 3문단으로", "찬반 라벨 바꿔" → edit_draft → setFields). */
  (function () {
    const fA = document.getElementById('factionA'), fB = document.getElementById('factionB');
    const setVal = (elm, v) => {
      if (elm == null || v == null) return;
      elm.value = String(v);
      try { elm.dispatchEvent(new Event('input', { bubbles: true })); elm.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
    };
    window.GALLA_WORKFORM = {
      type: 'issue',
      getFields() {
        return {
          title: titleEl ? titleEl.value : '', one_line: oneLineEl ? oneLineEl.value : '',
          description: descEl ? descEl.value : '', category: categoryEl ? categoryEl.value : '',
          faction_a: fA ? fA.value : '', faction_b: fB ? fB.value : ''
        };
      },
      setFields(f) {
        if (!f) return;
        if ('title' in f) setVal(titleEl, f.title);
        if ('one_line' in f) setVal(oneLineEl, f.one_line);
        if ('description' in f) setVal(descEl, f.description);
        if ('category' in f && f.category) setVal(categoryEl, f.category);
        if ('faction_a' in f) setVal(fA, f.faction_a);
        if ('faction_b' in f) setVal(fB, f.faction_b);
      },
      // 🚀 도킹 [올리기↑] — 스텝 인지: 1단계면 다음으로, 2단계면 필수(입장·기부처) 점검 후 미리보기로.
      //    이전엔 submit 자체가 없어 버튼이 '무반응'이었음(실사용 E2E 마찰#6) + 필수 미충족이 조용히 실패(#7).
      submit() {
        try {
          const nextBtn = [...document.querySelectorAll('button')].find(b => b.offsetParent && /다음 단계/.test(b.textContent));
          if (nextBtn) { nextBtn.click(); return; }   // 스텝1 → 스텝2
          // 스텝2 — 필수 미충족이면 정확히 짚고 스크롤(조용한 실패 방지)
          const need = [];
          if (categoryEl && !categoryEl.value) need.push(['카테고리를 골라주세요', categoryEl]);
          const st = document.querySelector('input[name="authorStance"]:checked');
          if (!st) need.push(['내 입장(찬성/반대)을 골라주세요 — 발의자도 참전!', document.querySelector('input[name="authorStance"]')]);
          const don = document.getElementById('donationTarget');
          if (don && !don.value) need.push(['기부처를 골라주세요', don]);
          if (need.length) {
            const [msg, el] = need[0];
            try { (el.closest('label,fieldset,div') || el).scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
            (window.GALLA_toast || alert)(msg);
            return;
          }
          const prevBtn = [...document.querySelectorAll('button')].find(b => b.offsetParent && /미리보기/.test(b.textContent));
          if (prevBtn) { prevBtn.click(); return; }
          if (form && form.requestSubmit) form.requestSubmit();
        } catch (_) {}
      },
      // 🖼 갈비스 AI 썸네일 → 미디어 캐러셀 첫 항목(표지)으로 자동 첨부
      setThumbnail(url) {
        if (!url) return;
        try {
          if (mediaItems.some(it => it.url === url)) return;   // 중복 방지
          mediaItems.unshift({ kind: 'image', file: null, url, thumb: null, up: false });
          if (mediaItems.length > MAX_MEDIA) mediaItems = mediaItems.slice(0, MAX_MEDIA);
          renderMedia(); persistMedia();
        } catch (_) {}
      },
      // ⬆️ 도킹 '올리기' → 이슈는 미리보기 단계로(폼 제출)
      submit() { const f = document.getElementById('writeForm'); if (!f) return; if (f.requestSubmit) f.requestSubmit(); else { const b = f.querySelector('[type=submit]'); b && b.click(); } },
      summary() { const g = this.getFields(); return `제목:${g.title || '-'} / 찬:${g.faction_a || '-'} vs 반:${g.faction_b || '-'}`; }
    };
    onCleanup(() => { try { if (window.GALLA_WORKFORM && window.GALLA_WORKFORM.type === 'issue') window.GALLA_WORKFORM = null; } catch (_) {} });
  })();

  /* ================= 미디어 (혼합 캐러셀: 사진+영상, 인스타식) ================= */
  const mediaInput = document.getElementById('mediaInput');
  const mediaBtn = document.getElementById('mediaBtn');
  const mediaPreview = document.getElementById('mediaPreview');

  const MAX_MEDIA = 10;
  const MAX_VID_DUR = (window.GALLA_bgVideo && window.GALLA_bgVideo.MAX_DURATION) || 180;

  /* 통합 미디어 모델 — 각 항목 { kind:'image'|'video', file, url, thumb, up }
     · file: 선택 원본(이미지는 4:5 크롭 완료)  · url: R2/Stream '즉시 업로드'로 확보(복원·발행 재사용)
     · thumb: 영상 포스터(자동)  · up: 업로드 진행 중
     순서 그대로 캐러셀. 첫 항목이 표지. 나갔다 와도 url로 복원, 발행 땐 재업로드 안 함. */
  let mediaItems = [];

  /* 업로드 모드 — 인스타식으로 '캐러셀'과 '영상+표지'를 명확히 분리.
     · carousel: 사진·영상 여러 개(혼합) → media[] 다중 → 피드 캐러셀
     · video   : 영상 1개 + 표지(=영상의 thumb, 별도 슬라이드 아님) → 단일 영상 저장 → 피드 영상만 */
  let mediaMode = 'carousel';
  const modeTabs = document.getElementById('mediaModeTabs');
  const coverInput = document.getElementById('coverInput');
  const dropTitle = document.getElementById('mediaDropTitle');
  const dropSub = document.getElementById('mediaDropSub');
  const mediaHint = document.getElementById('mediaHint');

  function setMediaMode(mode, opts) {
    opts = opts || {};
    if (mode !== 'video' && mode !== 'carousel') return;
    if (mode === mediaMode && !opts.force) return;
    // 영상 모드로 전환 시 기존 선택이 '영상 1개' 아니면 비움(모드 혼선 방지)
    if (!opts.silent && mediaItems.length && mode !== mediaMode) {
      const keep = (mode === 'video')
        ? (mediaItems.length === 1 && mediaItems[0].kind === 'video')
        : true; // 캐러셀은 기존 항목 그대로 수용
      if (!keep) {
        if (!confirm('모드를 바꾸면 지금 담은 미디어가 지워져요. 계속할까요?')) return;
        mediaItems = [];
      }
    }
    mediaMode = mode;
    if (modeTabs) modeTabs.querySelectorAll('.mm-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === mode));
    if (mode === 'video') {
      mediaInput.setAttribute('accept', 'video/*');
      mediaInput.removeAttribute('multiple');
      if (dropTitle) dropTitle.textContent = '영상 올리기';
      if (dropSub) dropSub.textContent = '영상 1개 · 썸네일은 따로 고를 수 있어요';
      if (mediaHint) mediaHint.textContent = '영상 1개 + 썸네일';
    } else {
      mediaInput.setAttribute('accept', 'image/*,video/*');
      mediaInput.setAttribute('multiple', '');
      if (dropTitle) dropTitle.textContent = '사진·영상 올리기';
      if (dropSub) dropSub.textContent = '여러 개는 캐러셀로 넘겨서 노출 · 첫 항목이 표지';
      if (mediaHint) mediaHint.textContent = '사진·영상 최대 10개';
    }
    renderMedia();
    persistMedia();
  }
  if (modeTabs) modeTabs.addEventListener('click', e => {
    const t = e.target.closest('.mm-tab'); if (!t) return;
    setMediaMode(t.dataset.mode);
  });

  // 표지(첫 항목) — 이미지면 url, 영상이면 포스터 thumb
  function coverUrl() {
    const f = mediaItems[0];
    if (!f) return null;
    return f.kind === 'video' ? (f.thumb || null) : (f.url || null);
  }
  function persistMedia() {
    try {
      const arr = mediaItems.filter(it => it.url).map(it => ({ type: it.kind, url: it.url, thumb: it.thumb || null }));
      window.GALLA_WriteMedia && window.GALLA_WriteMedia.setMedia(arr);
    } catch (_) {}
  }
  function mediaThumbSrc(it) {
    if (it.kind === 'video') return it.thumb || '';
    return it.url || (it.file ? URL.createObjectURL(it.file) : '');
  }

  // 미리보기 스트립 — 사진·영상 섞임, 각 항목 삭제(✕) + 추가(＋), 첫 항목 '표지'
  function renderMedia() {
    // 🎬 영상 모드 — 비어있어도 항상 '영상 슬롯 / 표지 슬롯' 두 개를 표시(각각 독립 선택).
    if (mediaMode === 'video') {
      if (mediaBtn) mediaBtn.style.display = 'none';
      const v = mediaItems[0];
      const hasVid = !!(v && v.kind === 'video');
      const poster = hasVid ? (v.poster || v.thumb || '') : '';
      const custom = !!(hasVid && v.coverCustom && v.thumb);
      mediaPreview.innerHTML = `
        <div class="vmode-slots">
          <div class="vmode-slot">
            <div class="vmode-slot-h">🎬 영상 <em class="req">필수</em></div>
            ${hasVid
              ? `<div class="vmode-thumb is-video${v.up ? ' uploading' : ''}">
                   ${poster ? `<img src="${poster}">` : `<div class="mi-vidph">🎬</div>`}
                   <span class="multi-img-play">▶</span>
                   ${v.up ? '<span class="multi-img-up"><i></i></span>' : ''}
                   <button type="button" class="vmode-del" data-del="video" aria-label="영상 삭제">✕</button>
                 </div>`
              : `<button type="button" class="vmode-pick" id="pickVideo"><span class="vmode-plus">＋</span><span>영상 선택</span></button>`}
          </div>
          <div class="vmode-slot">
            <div class="vmode-slot-h">🖼 썸네일 <em class="opt">선택</em></div>
            ${custom
              ? `<div class="vmode-thumb${v.coverUp ? ' uploading' : ''}">
                   <img src="${v.thumb}">
                   ${v.coverUp ? '<span class="multi-img-up"><i></i></span>' : ''}
                   <button type="button" class="vmode-del" data-del="cover" aria-label="썸네일 삭제">✕</button>
                 </div>`
              : `<button type="button" class="vmode-pick vmode-pick--cover" id="pickCover" ${hasVid ? '' : 'disabled'}><span class="vmode-plus">＋</span><span>썸네일 선택</span><em>안 고르면 첫 장면</em></button>`}
          </div>
        </div>
        <div class="guide-text">영상 필수 · 썸네일은 선택(안 고르면 영상 첫 장면) · 피드에선 <b>영상만</b> 재생</div>
      `;
      return;
    }

    // 캐러셀 모드 — 비어있으면 드롭존
    if (!mediaItems.length) {
      mediaPreview.innerHTML = '';
      if (mediaBtn) mediaBtn.style.display = '';
      return;
    }
    if (mediaBtn) mediaBtn.style.display = 'none';

    mediaPreview.innerHTML = `
      <div class="multi-img-strip">
        ${mediaItems.map((it, i) => `
          <div class="multi-img-item${it.up ? ' uploading' : ''}${it.kind === 'video' ? ' is-video' : ''}">
            ${it.kind === 'video'
              ? (it.thumb ? `<img src="${it.thumb}">` : `<div class="mi-vidph">🎬</div>`) + `<span class="multi-img-play">▶</span>`
              : `<img src="${mediaThumbSrc(it)}">`}
            ${it.up ? '<span class="multi-img-up"><i></i></span>' : ''}
            ${i === 0 ? '<span class="multi-img-badge">표지</span>' : '<span class="multi-img-num">' + (i + 1) + '</span>'}
            <button type="button" class="multi-img-del" data-idx="${i}" aria-label="삭제">✕</button>
            ${mediaItems.length > 1 ? `<div class="multi-img-move">
              <button type="button" class="mim-mv" data-mv="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="앞으로">‹</button>
              <button type="button" class="mim-mv" data-mv="${i}" data-dir="1" ${i === mediaItems.length - 1 ? 'disabled' : ''} aria-label="뒤로">›</button>
            </div>` : ''}
          </div>
        `).join('')}
        ${mediaItems.length < MAX_MEDIA
          ? `<button type="button" class="multi-img-add" id="mediaAddMore" aria-label="미디어 추가">＋</button>`
          : ''}
      </div>
      <div class="guide-text">${mediaItems.length}/${MAX_MEDIA} · 첫 항목이 표지 · ‹ ›로 순서 변경${mediaItems.length > 1 ? ' · 캐러셀로 노출' : ''}</div>
    `;
  }

  function videoDuration(file) {
    return new Promise(resolve => {
      try {
        const v = document.createElement('video'); v.preload = 'metadata';
        const u = URL.createObjectURL(file);
        v.onloadedmetadata = () => { URL.revokeObjectURL(u); resolve(v.duration || 0); };
        v.onerror = () => { URL.revokeObjectURL(u); resolve(0); };
        v.src = u; setTimeout(() => resolve(0), 8000);
      } catch (_) { resolve(0); }
    });
  }

  async function uploadImageItem(it) {
    if (!it.file || it.url) return;
    it.up = true;
    try { if (typeof window.GALLA_UPLOAD_MEDIA === 'function') it.url = await window.GALLA_UPLOAD_MEDIA(it.file, 'image'); }
    catch (err) { console.warn('[write] 사진 업로드 실패 — 발행 때 재시도', err); }
    finally { it.up = false; renderMedia(); persistMedia(); }
  }
  async function uploadVideoItem(it) {
    if (!it.file || it.url) return;
    it.up = true; renderMedia();
    try {
      const up = window.GALLA_UPLOAD_VIDEO || window.GALLA_UPLOAD_VIDEO_STREAM;
      if (up) {
        const out = await up(it.file);
        it.url = out.url || out.hls;
        it.poster = out.thumbnail || it.poster || null;   // 영상 자동 프레임(영상 슬롯 표시 + 기본 표지)
        if (!it.coverCustom) it.thumb = it.poster;         // 커스텀 표지 없으면 자동 프레임을 표지로
      }
    } catch (err) { console.warn('[write] 영상 업로드 실패 — 발행 때 재시도', err); }
    finally { it.up = false; renderMedia(); persistMedia(); }
  }

  async function addMediaFiles(files) {
    files = [...(files || [])].filter(Boolean);
    if (!files.length) return;

    // 🎬 영상 모드 — 영상 1개만(기존 것 교체). 표지는 coverInput으로 따로.
    if (mediaMode === 'video') {
      const vf = files.find(f => /^video\//.test(f.type));
      if (!vf) { alert('영상 파일을 선택해주세요.'); return; }
      const dur = await videoDuration(vf);
      if (dur && dur > MAX_VID_DUR + 1) { alert(`영상이 너무 길어요 (${Math.round(dur)}초) — 최대 ${MAX_VID_DUR}초까지 올릴 수 있어요.`); return; }
      const it = { kind: 'video', file: vf, url: null, thumb: null, up: true };
      mediaItems = [it];
      renderMedia();
      uploadVideoItem(it);
      if (typeof removeResumeBanner === 'function') removeResumeBanner();
      persistMedia();
      return;
    }

    let room = MAX_MEDIA - mediaItems.length;
    if (room <= 0) { alert(`미디어는 최대 ${MAX_MEDIA}개까지 올릴 수 있어요.`); return; }
    if (files.length > room) { alert(`${room}개만 더 추가할 수 있어 처음 ${room}개만 담았어요.`); files = files.slice(0, room); }

    // 🎠 선택 순서 그대로 보존 — 사진/영상을 분리하지 않고 파일 순서대로 항목을 만든다.
    //    (사진은 크롭이 배치라, 먼저 배치 크롭해두고 순서대로 되꺼내 매핑한다.)
    const imgFiles = files.filter(f => /^image\//.test(f.type));
    let processed = imgFiles;
    if (imgFiles.length) {
      mediaPreview.insertAdjacentHTML('afterbegin', `<div class="guide-text" id="mediaProc">사진 처리 중…</div>`);
      try { processed = typeof window.GALLA_PROCESS_IMAGES === 'function' ? (await window.GALLA_PROCESS_IMAGES(imgFiles) || imgFiles) : imgFiles; }
      catch (err) { console.error('[CROP ERROR]', err); processed = imgFiles; }
      document.getElementById('mediaProc')?.remove();
    }

    let pi = 0;                       // processed 이미지 큐 인덱스
    const added = [];
    for (const f of files) {
      if (mediaItems.length + added.length >= MAX_MEDIA) break;
      if (/^video\//.test(f.type)) {
        const dur = await videoDuration(f);
        if (dur && dur > MAX_VID_DUR + 1) { alert(`영상이 너무 길어요 (${Math.round(dur)}초) — 최대 ${MAX_VID_DUR}초까지 올릴 수 있어요.`); continue; }
        added.push({ kind: 'video', file: f, url: null, thumb: null, up: true });
      } else if (/^image\//.test(f.type)) {
        const pf = processed[pi++] || f;
        added.push({ kind: 'image', file: pf, url: null, thumb: null, up: true });
      }
    }
    if (added.length) {
      mediaItems = mediaItems.concat(added);   // 선택 순서 유지
      renderMedia();
      added.forEach(it => it.kind === 'video' ? uploadVideoItem(it) : uploadImageItem(it));
    }

    if (typeof removeResumeBanner === 'function') removeResumeBanner();   // 새로 고르면 이어쓰기 배너 닫기
    persistMedia();
  }

  mediaInput.addEventListener('click', () => { mediaInput.value = ''; });
  mediaInput.addEventListener('change', e => { addMediaFiles(e.target.files); });

  // 🎬 영상 모드 표지(썸네일) 선택 — 영상 아이템의 thumb만 교체(슬라이드 추가 아님)
  if (coverInput) coverInput.addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    coverInput.value = '';
    const v = mediaItems[0];
    if (!f || !v || v.kind !== 'video') return;
    v.coverCustom = true; v.coverUp = true; renderMedia();
    try {
      let file = f;
      if (typeof window.GALLA_PROCESS_IMAGES === 'function') {
        const pr = await window.GALLA_PROCESS_IMAGES([f]);
        if (pr && pr[0]) file = pr[0];
      }
      const url = await window.GALLA_UPLOAD_MEDIA(file, 'image');
      if (url) v.thumb = url; else v.coverCustom = false;
    } catch (err) { console.warn('[write] 표지 업로드 실패', err); v.coverCustom = false; }
    finally { v.coverUp = false; renderMedia(); persistMedia(); }
  });

  // 스트립 내 삭제(✕) / 순서이동(‹ ›) / 추가(＋) 위임
  mediaPreview.addEventListener('click', e => {
    // 🎬 영상 모드 두 슬롯
    if (e.target.closest('#pickVideo')) { mediaInput.value = ''; mediaInput.click(); return; }
    const vdel = e.target.closest('.vmode-del');
    if (vdel) {
      const v = mediaItems[0];
      if (vdel.dataset.del === 'cover') { if (v) { v.coverCustom = false; v.thumb = v.poster || null; } }
      else { mediaItems = []; }           // 영상 삭제 → 전체 리셋
      renderMedia(); persistMedia(); return;
    }
    const del = e.target.closest('.multi-img-del');
    if (del) { mediaItems.splice(Number(del.dataset.idx), 1); renderMedia(); persistMedia(); return; }
    const mv = e.target.closest('.mim-mv');
    if (mv) {
      const i = Number(mv.dataset.mv), j = i + Number(mv.dataset.dir);
      if (j >= 0 && j < mediaItems.length) { const t = mediaItems[i]; mediaItems[i] = mediaItems[j]; mediaItems[j] = t; renderMedia(); persistMedia(); }
      return;
    }
    if (e.target.closest('.multi-img-add')) { mediaInput.value = ''; mediaInput.click(); return; }
    if (e.target.closest('#pickCover')) { coverInput && (coverInput.value = '', coverInput.click()); return; }
  });

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
    return mediaItems.length > 0;
  }

  document.getElementById('toStep2')?.addEventListener('click', () => {
    if (!hasMedia()) {
      alert('사진이나 영상을 1개 이상 올려주세요.');
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
    // 새 모델(media[]) 우선, 없으면 레거시(images + video_url)를 혼합 캐러셀로 승격
    let arr = Array.isArray(c.media) ? c.media.slice() : null;
    if (!arr || !arr.length) {
      arr = [];
      (Array.isArray(c.images) ? c.images : []).forEach(u => u && arr.push({ type: 'image', url: u }));
      if (c.video_url) arr.push({ type: 'video', url: c.video_url, thumb: c.card_thumb_url || null });
    }
    if (arr.length) {
      mediaItems = arr.filter(m => m && m.url).map(m => ({
        kind: m.type === 'video' ? 'video' : 'image', file: null, url: m.url, thumb: m.thumb || null, up: false,
      }));
      // 모드 추론 — 영상 1개뿐이면 '영상+표지', 그 외 '캐러셀'
      const inferred = (mediaItems.length === 1 && mediaItems[0].kind === 'video') ? 'video' : 'carousel';
      setMediaMode(inferred, { silent: true, force: true });
    }
    if (mediaItems.length && Number(c.step) === 2) goStep(2);
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
    mediaItems = [];
    renderMedia();
    removeResumeBanner();
  }
  function showResumeBanner() {
    removeResumeBanner();
    const c = (window.GALLA_WriteMedia && window.GALLA_WriteMedia.get()) || {};
    const m0 = (Array.isArray(c.media) && c.media[0]) || null;
    const thumb = (m0 && (m0.thumb || (m0.type !== 'video' ? m0.url : ''))) ||
                  (Array.isArray(c.images) && c.images[0]) || c.card_thumb_url || '';
    const isVid = !thumb && !!(c.video_url || (m0 && m0.type === 'video'));
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
    if (mediaItems.length > 0) return true;
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

    /* ── 미리보기 ─────────────────────────────────────────
       발행 뒤 이슈 페이지(issue.html)와 '같은 순서·같은 구성'으로 보여준다.
       예전 미리보기는 순서가 실제와 달랐고(미디어가 중간), 실제로는 없는
       '🎥 1분 엘리베이터 스피치' 버튼이 떴다 → 사장님 제보로 제거.
       실제 순서: 작성자 헤드 → 미디어 → 제목·한줄 → 액션바 → 진영 선택 → 핵심 요약 */
    const esc = (s) => (s == null ? '' : String(s).replace(/[&<>"]/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));

    const factionA = factionAEl.value.trim() || '찬성이오';
    const factionB = factionBEl.value.trim() || '난 반댈세';

    // 혼합 캐러셀 미리보기 — 첫 항목(표지)만 대표로 보여주고, 여러 개면 인디케이터
    let mediaHtml = '';
    const m0 = mediaItems[0];
    if (m0) {
      const first = m0.kind === 'video'
        ? (m0.url
            ? `<video src="${esc(m0.url)}" ${m0.thumb ? `poster="${esc(m0.thumb)}"` : ''} controls playsinline muted preload="metadata"></video>`
            : `<img src="${esc(m0.thumb || '')}" alt="">`)
        : `<img src="${esc(mediaThumbSrc(m0))}" alt="">`;
      mediaHtml = `<div class="prev-media">
        ${first}
        ${mediaItems.length > 1 ? `<div class="prev-dots">${
          mediaItems.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')
        }</div><div class="prev-count">1/${mediaItems.length}</div>` : ''}
      </div>`;
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
      let media = null;

      // 🎠 혼합 캐러셀 업로드 — 순서 유지. 즉시 업로드로 이미 url 있으면 재업로드 안 함.
      const publishBtn = document.getElementById('publishPreview');
      const O = window.GALLA_UploadOverlay;

      // 아직 안 올라간 항목이 있으면 인스타식 전체화면 진행 UI를 띄운다(발행 전 검사 직전).
      const pending = mediaItems.find(it => !it.url && it.file);
      const showOverlay = !!O && !!pending;

      try {
        publishBtn.disabled = true;
        publishBtn.textContent = '업로드 중…';
        if (showOverlay) O.show({ label: '업로드 중…', thumb: { file: pending.file } });

        media = [];
        const imgUrls = [];
        let firstVideoUrl = null;
        const total = mediaItems.length;
        for (let i = 0; i < mediaItems.length; i++) {
          const it = mediaItems[i];
          if (!it.url && it.file) {
            if (O && showOverlay) { O.thumb({ file: it.file }); O.label(`업로드 중… (${i + 1}/${total})`); }
            const onP = p => { if (O && showOverlay) O.progress(p == null ? 0 : p); };
            if (it.kind === 'video') {
              const up = window.GALLA_UPLOAD_VIDEO || window.GALLA_UPLOAD_VIDEO_STREAM;
              const out = await up(it.file, onP);
              it.url = out.url || out.hls;
              it.thumb = it.thumb || out.thumbnail || null;
            } else {
              it.url = await window.GALLA_UPLOAD_MEDIA(it.file, 'image', onP);
            }
          }
          if (!it.url) continue;
          media.push({ type: it.kind, url: it.url, thumb: it.thumb || null });
          if (it.kind === 'image') imgUrls.push(it.url);
          else if (!firstVideoUrl) firstVideoUrl = it.url;
        }

        // 하위호환 필드 — 구 렌더러도 최소한 표지·영상을 보이도록
        images = imgUrls.length ? imgUrls : null;
        video_url = firstVideoUrl;
        const c0 = mediaItems[0];
        thumbnail_url = c0 ? (c0.kind === 'video' ? (c0.thumb || null) : c0.url) : null;
        card_thumb_url = thumbnail_url;   // 마이페이지 카드 표지 = 첫 항목
        if (!media.length) media = null;

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
        if (media) draftPayload.media = media;   // 🎠 혼합 캐러셀(순서 있는 사진+영상)

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
          .select('thumbnail_url,video_url,images,card_thumb_url,media')
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
        if (media) draftPayload.media = media;
        else if (existing.media) draftPayload.media = existing.media;
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

    // 후시대본(openSpeech) — 미리보기에 영상이 있을 때만. ⚠️ 예전 단일영상 코드의 잔재로
    //    write.js엔 videoEl 정의가 없어 ReferenceError→발행 흐름이 깨졌음(2026-08-03 수정).
    const __speechVid = issuePreview.querySelector('video');
    const __speechBtn = document.getElementById('openSpeech');
    if (__speechVid && __speechBtn) {
      __speechBtn.onclick = () => openSpeech(__speechVid.currentSrc || __speechVid.src);
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
