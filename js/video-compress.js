/* ===========================================================
   video-compress.js
   - 업로드 직전 브라우저에서 영상을 재인코딩(트랜스코딩)해 용량 축소
   - 원본 아이폰 .mov(수백 MB, 초고비트레이트)를 720p / ~2.5Mbps H.264(webm/mp4)로 재기록
   - window.GALLA_COMPRESS_VIDEO(file, onProgress?) → File (압축본 또는 원본)
       onProgress(percent:0~100) : 재인코딩 진행률
   - 설계 원칙: "절대 업로드를 깨지 않는다"
       · 필요한 브라우저 API가 하나라도 없으면 원본 그대로 반환
       · 재인코딩 중 어떤 오류가 나도 원본 그대로 반환
       · 결과가 원본보다 크면(작아지지 않으면) 원본 사용
   - 실시간 재생 기반이라 N초 영상은 대략 N초 소요 (1회성 업로드라 감수)
=========================================================== */
(function () {
  const MAX_DIM = 1280;            // 긴 변 최대 720p(1280) 기준
  const VIDEO_BPS = 2_500_000;     // 목표 영상 비트레이트 ~2.5Mbps
  const AUDIO_BPS = 128_000;       // 오디오 128kbps
  const MIN_SIZE = 8 * 1024 * 1024; // 8MB 이하 클립은 압축 스킵(이미 충분히 가벼움)

  // 이 브라우저에서 재인코딩에 필요한 API가 모두 있는지
  function isSupported() {
    return (
      typeof MediaRecorder !== 'undefined' &&
      typeof HTMLCanvasElement !== 'undefined' &&
      typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
      (window.AudioContext || window.webkitAudioContext)
    );
  }

  // 이 브라우저가 만들어낼 수 있는 최적 컨테이너/코덱 선택
  function pickMime() {
    const cands = [
      'video/mp4;codecs=h264,aac',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    for (const m of cands) {
      try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (_) {}
    }
    return '';
  }

  function extFor(mime) {
    return mime.indexOf('mp4') !== -1 ? 'mp4' : 'webm';
  }

  function even(n) { n = Math.round(n); return n % 2 ? n - 1 : n; }

  async function compress(file, onProgress) {
    if (!file || !/^video\//i.test(file.type || '') || file.size < MIN_SIZE) return file;
    if (!isSupported()) return file;
    const mime = pickMime();
    if (!mime) return file;

    let objectUrl = null, audioCtx = null, recorder = null, rafId = 0;
    const cleanup = () => {
      try { if (rafId) cancelAnimationFrame(rafId); } catch (_) {}
      try { if (audioCtx && audioCtx.state !== 'closed') audioCtx.close(); } catch (_) {}
      try { if (objectUrl) URL.revokeObjectURL(objectUrl); } catch (_) {}
    };

    try {
      objectUrl = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.muted = true;              // 화면상 무음(캡처 오디오는 WebAudio로 별도 취득)
      video.playsInline = true;
      video.preload = 'auto';
      video.src = objectUrl;

      await new Promise((res, rej) => {
        video.onloadedmetadata = res;
        video.onerror = () => rej(new Error('video_decode'));
        setTimeout(() => rej(new Error('metadata_timeout')), 20000);
      });

      const dur = video.duration;
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh || !isFinite(dur) || dur <= 0) return file;

      // 목표 해상도: 긴 변을 MAX_DIM으로 축소(원본이 더 작으면 그대로)
      const scale = Math.min(1, MAX_DIM / Math.max(vw, vh));
      const tw = Math.max(2, even(vw * scale));
      const th = Math.max(2, even(vh * scale));

      const canvas = document.createElement('canvas');
      canvas.width = tw; canvas.height = th;
      const ctx = canvas.getContext('2d', { alpha: false });

      // 비디오 트랙: 캔버스 캡처
      const canvasStream = canvas.captureStream();
      const tracks = [canvasStream.getVideoTracks()[0]];

      // 오디오 트랙: MediaElementSource → MediaStreamDestination (스피커로는 안 보냄)
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
        if (audioCtx.state === 'suspended') { try { await audioCtx.resume(); } catch (_) {} }
        const srcNode = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        srcNode.connect(dest);         // destination(스피커)에는 연결 X → 무음 캡처
        const at = dest.stream.getAudioTracks()[0];
        if (at) tracks.push(at);
      } catch (_) { /* 오디오 없거나 미지원 → 영상만 */ }

      const stream = new MediaStream(tracks);
      recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: VIDEO_BPS,
        audioBitsPerSecond: AUDIO_BPS,
      });

      const chunks = [];
      recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };

      const done = new Promise((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = () => reject(new Error('recorder'));
      });

      // 프레임 드로잉 루프 (requestVideoFrameCallback 우선, 없으면 rAF)
      const draw = () => { try { ctx.drawImage(video, 0, 0, tw, th); } catch (_) {} };
      const hasRVFC = typeof video.requestVideoFrameCallback === 'function';
      const pump = () => {
        draw();
        if (onProgress && dur) onProgress(Math.min(99, Math.round((video.currentTime / dur) * 100)));
        if (video.ended || recorder.state === 'inactive') return;
        if (hasRVFC) video.requestVideoFrameCallback(pump);
        else rafId = requestAnimationFrame(pump);
      };

      recorder.start(1000);
      await video.play();
      if (hasRVFC) video.requestVideoFrameCallback(pump); else pump();

      // 재생 종료 → 녹화 종료. 안전장치: 길이의 2배+15s 넘으면 강제 종료
      const guard = setTimeout(() => { try { if (recorder.state !== 'inactive') recorder.stop(); } catch (_) {} },
        dur * 2000 + 15000);
      video.onended = () => { try { if (recorder.state !== 'inactive') recorder.stop(); } catch (_) {} };

      await done;
      clearTimeout(guard);

      const blob = new Blob(chunks, { type: mime.split(';')[0] });
      cleanup();

      // 실제로 작아졌을 때만 채택
      if (!blob.size || blob.size >= file.size) return file;

      const base = (file.name || 'video').replace(/\.[^.]+$/, '');
      const out = new File([blob], `${base}.${extFor(mime)}`, { type: blob.type });
      if (onProgress) onProgress(100);
      return out;
    } catch (err) {
      console.warn('[video-compress] 재인코딩 실패 → 원본 업로드:', err && err.message);
      cleanup();
      return file;
    }
  }

  window.GALLA_COMPRESS_VIDEO = compress;
})();
