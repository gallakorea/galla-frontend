/* ===========================================================
   media-upload.js
   - Cloudflare R2 업로드 공용 헬퍼
   - upload-media 엣지 함수에서 signed PUT URL을 받아 직접 업로드
   - window.GALLA_UPLOAD_MEDIA(file, 'image'|'video', onProgress?) → publicUrl
     onProgress(percent:0~100 | null) : 진행률 콜백 (null = 진행률 계산 불가)
=========================================================== */
(function () {
  const FN_URL = 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/upload-media';

  // 업로드가 이 시간(ms) 동안 1바이트도 진행되지 않으면 멈춘 것으로 간주하고 중단
  const STALL_MS = 45000;

  async function getAccessToken() {
    const supabase = window.supabaseClient;
    if (!supabase) throw new Error('Supabase 초기화 실패');
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error('로그인이 필요합니다.');
    return token;
  }

  // XHR PUT: 진행률 + 멈춤(stall) 감지 지원
  function putWithProgress(url, headers, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url, true);
      if (headers) {
        Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      }

      let stallTimer = null;
      const resetStall = () => {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          xhr.abort();
          reject(new Error('stall')); // 일정 시간 진행이 없으면 중단
        }, STALL_MS);
      };

      xhr.upload.onprogress = e => {
        resetStall();
        if (onProgress) {
          onProgress(e.lengthComputable ? Math.round((e.loaded / e.total) * 100) : null);
        }
      };
      xhr.onload = () => {
        if (stallTimer) clearTimeout(stallTimer);
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`http_${xhr.status}`));
      };
      xhr.onerror = () => { if (stallTimer) clearTimeout(stallTimer); reject(new Error('network')); };
      xhr.onabort = () => { if (stallTimer) clearTimeout(stallTimer); };

      resetStall();
      xhr.send(file);
    });
  }

  // 폴백: 파일을 엣지 함수로 보내 서버에서 R2로 업로드 (CORS 불필요)
  async function uploadViaProxy(file, kind, token) {
    const res = await fetch(FN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': file.type || 'application/octet-stream',
        'x-upload-mode': 'proxy',
        'x-upload-kind': kind,
        'x-upload-filename': encodeURIComponent(file.name),
      },
      body: file,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.publicUrl) {
      throw new Error(data?.error || `업로드 실패 (${res.status})`);
    }
    return data.publicUrl;
  }

  async function uploadMedia(file, kind, onProgress) {
    const supabase = window.supabaseClient;
    if (!supabase) throw new Error('Supabase 초기화 실패');
    const token = await getAccessToken();

    // ⚠️ 클라이언트 영상 재인코딩 비활성화 (2026-07-12)
    //   실시간 canvas+WebAudio+MediaRecorder 트랜스코딩이 오디오 싱크를 깨뜨려
    //   ("소리가 나오다 끊김") 원본 그대로 업로드하도록 되돌림. 오디오 정상성 우선.
    //   영상 용량/스트리밍의 진짜 해결책은 서버측 Cloudflare Stream(적응형 HLS).
    //   재인코딩 로직은 js/video-compress.js 에 보존(미사용).
    const ENABLE_CLIENT_VIDEO_COMPRESS = false;
    if (ENABLE_CLIENT_VIDEO_COMPRESS && kind === 'video' && window.GALLA_COMPRESS_VIDEO) {
      try {
        if (onProgress) onProgress(0);
        const before = file.size;
        file = await window.GALLA_COMPRESS_VIDEO(file, p => {
          if (onProgress) onProgress(Math.round(p * 0.5));
        });
        if (file.size < before) {
          console.info(`[media-upload] 영상 압축: ${(before/1048576).toFixed(1)}MB → ${(file.size/1048576).toFixed(1)}MB`);
        }
      } catch (_) { /* 압축 실패 무시, 원본 업로드 */ }
    }

    const { data, error } = await supabase.functions.invoke('upload-media', {
      body: {
        kind,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
      },
    });
    if (error) throw error;
    if (!data?.uploadUrl) throw new Error(data?.error || '업로드 URL 발급 실패');

    try {
      await putWithProgress(data.uploadUrl, data.headers, file, onProgress);
      return data.publicUrl;
    } catch (err) {
      // CORS/네트워크/stall로 직접 업로드가 막힌 경우 프록시 경로로 재시도
      console.warn('[media-upload] direct PUT 실패, 프록시로 재시도:', err.message);
      if (onProgress) onProgress(null);
      return uploadViaProxy(file, kind, token);
    }
  }

  window.GALLA_UPLOAD_MEDIA = uploadMedia;

  /* ===========================================================
     대용량 영상 전용: Cloudflare Stream 재개가능(tus) 업로드
     - R2 경유 없이 Stream으로 청크 직접 업로드 → 네트워크가 끊겨도 재개
     - window.GALLA_UPLOAD_VIDEO_STREAM(file, onProgress?) → { hls, thumbnail, uid }
  =========================================================== */
  // tus 청크: 256KiB 배수 + 최소 5MiB 규칙 충족. 50MiB(=200×256KiB).
  const TUS_CHUNK = 50 * 1024 * 1024;
  const TUS_MAX_RETRY = 6;

  async function tusHeadOffset(uploadURL, fallback) {
    try {
      const r = await fetch(uploadURL, { method: 'HEAD', headers: { 'Tus-Resumable': '1.0.0' } });
      if (r.ok || r.status === 204) {
        const o = Number(r.headers.get('Upload-Offset'));
        if (Number.isFinite(o) && o >= 0) return o;
      }
    } catch (_) { /* 무시 */ }
    return fallback;
  }

  async function uploadVideoToStream(file, onProgress) {
    const supabase = window.supabaseClient;
    if (!supabase) throw new Error('Supabase 초기화 실패');
    await getAccessToken(); // 로그인 보장

    // 1) Stream tus 업로드 세션(일회용 URL) 발급
    const { data, error } = await supabase.functions.invoke('stream-upload', {
      body: { size: file.size, name: file.name },
    });
    if (error) throw error;
    if (!data?.uploadURL) throw new Error(data?.error || '업로드 세션 생성 실패');

    const uploadURL = data.uploadURL;
    let offset = 0;
    if (onProgress) onProgress(0);

    // 2) 청크 단위 PATCH 업로드(재개 지원)
    while (offset < file.size) {
      const end = Math.min(offset + TUS_CHUNK, file.size);
      const chunk = file.slice(offset, end); // Blob.slice — 전송 시점까지 메모리에 올리지 않음
      let attempt = 0, done = false;
      while (!done) {
        try {
          const r = await fetch(uploadURL, {
            method: 'PATCH',
            headers: {
              'Tus-Resumable': '1.0.0',
              'Upload-Offset': String(offset),
              'Content-Type': 'application/offset+octet-stream',
            },
            body: chunk,
          });
          if (r.status === 204 || r.status === 200) {
            const no = Number(r.headers.get('Upload-Offset'));
            offset = (Number.isFinite(no) && no > offset) ? no : end;
            done = true;
          } else if (r.status === 409 || r.status === 460) {
            // 오프셋 불일치 → 서버 기준으로 재동기화 후 그 지점부터 다시
            offset = await tusHeadOffset(uploadURL, offset);
            done = true;
          } else {
            throw new Error('tus_' + r.status);
          }
        } catch (e) {
          attempt++;
          if (attempt > TUS_MAX_RETRY) throw new Error('stall');
          await new Promise(res => setTimeout(res, 1500 * attempt)); // 지수적 백오프
          offset = await tusHeadOffset(uploadURL, offset); // 끊긴 지점 복구
        }
      }
      if (onProgress) onProgress(Math.min(99, Math.round((offset / file.size) * 100)));
    }
    if (onProgress) onProgress(100);
    return { hls: data.hls, thumbnail: data.thumbnail, uid: data.uid };
  }

  window.GALLA_UPLOAD_VIDEO_STREAM = uploadVideoToStream;
})();
