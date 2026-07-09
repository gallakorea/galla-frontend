/* =========================================================
   GALLA 이미지 크롭 (업로드 시 4:5 세로 프레임 강제)
   - 피드/이슈는 무조건 세로(4:5)로만 노출되므로 업로드 때 4:5로 확정
   - 가로/넓은 사진은 사용자가 "보여질 부분"을 직접 드래그·확대해 선택
   - 세로 사진은 중앙 기준 자동 크롭
   window.GALLA_PROCESS_IMAGES(fileList) -> Promise<File[]>
========================================================= */
(function () {
  const TARGET_W = 1080, TARGET_H = 1350;      // 4:5
  const TARGET_RATIO = TARGET_W / TARGET_H;    // 0.8
  // 이 값보다 넓으면(=가로거나 4:5보다 넓으면) 사용자에게 크롭 선택을 강제
  const CHOOSE_ABOVE = 0.82;

  function loadImg(file) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
  }

  function canvasToFile(canvas, name) {
    return new Promise(res => {
      canvas.toBlob(b => {
        const base = (name || 'image').replace(/\.[^.]+$/, '');
        res(new File([b], base + '_4x5.jpg', { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.9);
    });
  }

  function drawCrop(img, sx, sy, sw, sh, name) {
    const c = document.createElement('canvas');
    c.width = TARGET_W; c.height = TARGET_H;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, TARGET_W, TARGET_H);
    return canvasToFile(c, name);
  }

  function centerCrop(img, name) {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    let sw, sh, sx, sy;
    if (iw / ih > TARGET_RATIO) { sh = ih; sw = ih * TARGET_RATIO; sx = (iw - sw) / 2; sy = 0; }
    else { sw = iw; sh = iw / TARGET_RATIO; sx = 0; sy = (ih - sh) / 2; }
    return drawCrop(img, sx, sy, sw, sh, name);
  }

  /* ---------------- 크롭 모달 ---------------- */
  let modal, vp, imgEl, zoomEl, countEl, applyBtn;
  let cur = null;        // { img, name, iw, ih, base, zoom, ox, oy, vpW, vpH, resolve }

  function injectStyle() {
    if (document.getElementById('gallaCropStyle')) return;
    const s = document.createElement('style');
    s.id = 'gallaCropStyle';
    s.textContent = `
#gallaCropModal{
  position:fixed; inset:0; z-index:9000;
  background:rgba(0,0,0,.9);
  display:none; align-items:center; justify-content:center;
  font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;
}
#gallaCropModal.on{ display:flex; }
#gallaCropModal .gc-sheet{
  width:100%; max-width:420px; padding:18px 16px 22px;
  display:flex; flex-direction:column; align-items:center; gap:14px;
}
#gallaCropModal .gc-top{
  width:100%; display:flex; align-items:center; justify-content:space-between;
  color:#fff;
}
#gallaCropModal .gc-title{ font-size:16px; font-weight:800; }
#gallaCropModal .gc-count{ font-size:13px; opacity:.7; }
#gallaCropModal .gc-vp{
  position:relative; width:min(78vw,300px); aspect-ratio:4/5;
  overflow:hidden; border-radius:12px; background:#000;
  touch-action:none; cursor:grab; user-select:none;
  box-shadow:0 0 0 2px rgba(255,255,255,.15);
}
#gallaCropModal .gc-vp:active{ cursor:grabbing; }
#gallaCropModal .gc-img{
  position:absolute; left:0; top:0; max-width:none; pointer-events:none;
}
#gallaCropModal .gc-hint{
  color:#cfcfcf; font-size:12px; line-height:1.5; text-align:center; max-width:300px;
}
#gallaCropModal .gc-zoom{
  width:min(78vw,300px); display:flex; align-items:center; gap:10px;
  color:#bbb; font-size:12px;
}
#gallaCropModal .gc-zoom-range{ flex:1; accent-color:#ff6a00; }
#gallaCropModal .gc-apply{
  width:min(78vw,300px); padding:13px; border:none; border-radius:12px;
  background:linear-gradient(180deg,#ff9b2f,#ff6a00); color:#fff;
  font-size:15px; font-weight:800;
}`;
    document.head.appendChild(s);
  }

  function ensureModal() {
    if (modal) return;
    injectStyle();
    modal = document.createElement('div');
    modal.id = 'gallaCropModal';
    modal.innerHTML = `
      <div class="gc-sheet">
        <div class="gc-top">
          <span class="gc-title">사진 위치 조정</span>
          <span class="gc-count"></span>
        </div>
        <div class="gc-vp"><img class="gc-img" draggable="false"></div>
        <div class="gc-hint">가로 사진이에요. 세로(4:5) 화면에 보여질 부분을<br>드래그하거나 확대해서 맞춰 주세요.</div>
        <div class="gc-zoom">
          <span>축소</span>
          <input type="range" class="gc-zoom-range" min="1" max="3" step="0.01" value="1">
          <span>확대</span>
        </div>
        <button class="gc-apply">적용</button>
      </div>`;
    document.body.appendChild(modal);
    vp = modal.querySelector('.gc-vp');
    imgEl = modal.querySelector('.gc-img');
    zoomEl = modal.querySelector('.gc-zoom-range');
    countEl = modal.querySelector('.gc-count');
    applyBtn = modal.querySelector('.gc-apply');

    zoomEl.addEventListener('input', () => {
      if (!cur) return;
      cur.zoom = parseFloat(zoomEl.value);
      layout();
    });
    applyBtn.addEventListener('click', applyCrop);
    bindDrag();
  }

  function layout() {
    const scale = cur.base * cur.zoom;
    const w = cur.iw * scale, h = cur.ih * scale;
    // 이미지가 항상 뷰포트를 덮도록 오프셋 제한
    cur.ox = Math.min(0, Math.max(cur.vpW - w, cur.ox));
    cur.oy = Math.min(0, Math.max(cur.vpH - h, cur.oy));
    imgEl.style.width = w + 'px';
    imgEl.style.height = h + 'px';
    imgEl.style.left = cur.ox + 'px';
    imgEl.style.top = cur.oy + 'px';
  }

  function bindDrag() {
    let dragging = false, px = 0, py = 0;
    vp.addEventListener('pointerdown', e => {
      dragging = true; px = e.clientX; py = e.clientY;
      vp.setPointerCapture(e.pointerId);
    });
    vp.addEventListener('pointermove', e => {
      if (!dragging || !cur) return;
      cur.ox += e.clientX - px;
      cur.oy += e.clientY - py;
      px = e.clientX; py = e.clientY;
      layout();
    });
    const up = () => { dragging = false; };
    vp.addEventListener('pointerup', up);
    vp.addEventListener('pointercancel', up);
  }

  function openModal(img, name, idx, total) {
    ensureModal();
    return new Promise(resolve => {
      modal.classList.add('on');
      const r = vp.getBoundingClientRect();
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const base = Math.max(r.width / iw, r.height / ih); // cover
      cur = {
        img, name, iw, ih, base, zoom: 1,
        vpW: r.width, vpH: r.height, resolve
      };
      // 초기: 중앙 정렬
      const w = iw * base, h = ih * base;
      cur.ox = (r.width - w) / 2;
      cur.oy = (r.height - h) / 2;
      zoomEl.value = '1';
      imgEl.src = img.src;
      countEl.textContent = total > 1 ? `${idx + 1} / ${total}` : '';
      layout();
    });
  }

  async function applyCrop() {
    if (!cur) return;
    const scale = cur.base * cur.zoom;
    const sx = -cur.ox / scale;
    const sy = -cur.oy / scale;
    const sw = cur.vpW / scale;
    const sh = cur.vpH / scale;
    const file = await drawCrop(cur.img, sx, sy, sw, sh, cur.name);
    const done = cur.resolve;
    cur = null;
    modal.classList.remove('on');
    done(file);
  }

  /* ---------------- public API ---------------- */
  window.GALLA_PROCESS_IMAGES = async function (files) {
    const out = [];
    const list = [...files];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (!f || !f.type || !f.type.startsWith('image/')) { out.push(f); continue; }
      let img;
      try { img = await loadImg(f); } catch { out.push(f); continue; }
      const ratio = img.naturalWidth / img.naturalHeight;
      if (ratio > CHOOSE_ABOVE) {
        // 가로/넓은 사진 → 사용자 선택
        out.push(await openModal(img, f.name, i, list.length));
      } else {
        // 세로 사진 → 중앙 자동 크롭(4:5 확정)
        out.push(await centerCrop(img, f.name));
      }
    }
    return out;
  };
})();
