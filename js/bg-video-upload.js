/* =========================================================
   🚀 영상 백그라운드 업로드 — 고르는 순간 올리기 시작한다
   문제: 지금은 '발행' 버튼을 누른 뒤에야 업로드가 시작된다. 아이폰 4K는 분당 ~400MB라
        LTE에서 몇 분씩 화면 앞에서 기다리게 된다. 사용자가 제목·진영을 입력하는 그 시간이
        통째로 놀고 있었다.
   해법: 영상을 고르는 즉시 전송을 시작하고, 발행 때는 이미 끝난 결과를 받아 쓴다.
        같은 파일·같은 회선인데 체감 대기가 거의 사라진다.

   ★ 압축(재인코딩)은 하지 않는다. Cloudflare Stream은 '길이(분)'로만 과금해서 압축해도
     비용이 줄지 않고, 화질 손실·오디오 싱크·코덱 호환 리스크만 떠안는다.
     (2026-07-12에 MediaRecorder 방식으로 시도했다가 오디오가 깨져 되돌린 이력이 있다.
      js/video-compress.js에 그 코드가 미사용으로 남아 있다.)
     저장 비용은 압축이 아니라 '길이 제한'이 푸는 문제다 → MAX_DURATION.

   API
     GALLA_bgVideo.pick(file)            선택 즉시 호출. {ok} 또는 {ok:false, reason}
     GALLA_bgVideo.result(file, onProg)  발행 때 호출. 결과 promise (필요하면 그때 업로드)
     GALLA_bgVideo.clear()               취소·영상 제거
     GALLA_bgVideo.progress()            0~100 (표시용)
   ========================================================= */
(function () {
  const MAX_DURATION = 180;                    // 3분 — 저장 비용은 길이로 결정된다
  const MAX_SIZE = 2 * 1024 * 1024 * 1024;     // 2GB 하드 가드

  let CUR = null;   // { file, promise, ctrl, pct, done, failed }

  function sameFile(a, b) {
    return a && b && a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
  }

  /* 길이는 선택 즉시 알려줘야 한다 — 발행 때 실패시키면 그때까지 쓴 글이 헛수고가 된다 */
  function duration(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration || 0); };
      v.onerror = () => { URL.revokeObjectURL(url); resolve(0); };   // 못 읽으면 통과(서버가 거른다)
      setTimeout(() => resolve(0), 8000);
      v.src = url;
    });
  }

  async function pick(file) {
    clear();
    if (!file) return { ok: false, reason: 'no_file' };
    if (file.size > MAX_SIZE) return { ok: false, reason: 'too_large' };

    const dur = await duration(file);
    if (dur && dur > MAX_DURATION + 1) {
      return { ok: false, reason: 'too_long', duration: Math.round(dur), max: MAX_DURATION };
    }

    const ctrl = new AbortController();
    const st = { file, ctrl, pct: 0, done: false, failed: false, promise: null };
    st.promise = window.GALLA_UPLOAD_VIDEO(
      file,
      (p) => { if (typeof p === 'number') { st.pct = p; emit(p); } },
      ctrl.signal
    ).then((out) => {
      st.done = true; st.pct = 100; emit(100);
      return out;
    }).catch((e) => {
      st.failed = true;
      // 실패해도 여기서 터뜨리지 않는다 — 발행 때 조용히 다시 올리면 된다.
      // (사용자는 아직 글을 쓰는 중이고, 이 시점의 오류 팝업은 맥락이 없다)
      if (!(e && e.message === 'aborted')) console.warn('[bg-video] 배경 업로드 실패 — 발행 때 재시도', e);
      return null;
    });

    CUR = st;
    return { ok: true, duration: Math.round(dur) };
  }

  /* 발행 시점. 배경 업로드가 끝났으면 즉시, 진행 중이면 이어받고, 실패·없음이면 지금 올린다. */
  async function result(file, onProgress) {
    if (CUR && sameFile(CUR.file, file)) {
      if (onProgress) onProgress(CUR.pct);
      SUBS.add(onProgress);
      const out = await CUR.promise;
      SUBS.delete(onProgress);
      if (out) { if (onProgress) onProgress(100); return out; }
      // 배경 업로드가 실패했다 → 지금 다시(이번엔 오류를 그대로 올린다)
    }
    return window.GALLA_UPLOAD_VIDEO(file, onProgress);
  }

  const SUBS = new Set();
  function emit(p) { SUBS.forEach((fn) => { try { fn && fn(p); } catch (_) {} }); }

  function clear() {
    if (CUR && !CUR.done) { try { CUR.ctrl.abort(); } catch (_) {} }
    CUR = null;
  }

  window.GALLA_bgVideo = {
    pick, result, clear,
    progress: () => (CUR ? CUR.pct : 0),
    isDone: () => !!(CUR && CUR.done),
    MAX_DURATION,
  };
})();
