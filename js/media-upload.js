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

    // 영상은 업로드 전에 브라우저에서 720p/~2.5Mbps로 재인코딩해 용량 축소
    // (미지원 브라우저·실패 시 원본 그대로 반환하므로 업로드는 절대 안 깨짐)
    if (kind === 'video' && window.GALLA_COMPRESS_VIDEO) {
      try {
        if (onProgress) onProgress(0);
        const before = file.size;
        file = await window.GALLA_COMPRESS_VIDEO(file, p => {
          // 압축 구간을 진행률 0~50%로 매핑, 업로드가 나머지 50~100%
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
})();
