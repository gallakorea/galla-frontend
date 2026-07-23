window.__CONFIRM_MODE__ = true;
let __USER_CONFIRMED_PUBLISH__ = false;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[confirm.js] Loaded');

  /* =====================
     Supabase client 대기
  ===================== */
  const waitForSupabase = () =>
    new Promise(resolve => {
      const t = setInterval(() => {
        if (window.supabaseClient) {
          clearInterval(t);
          resolve(window.supabaseClient);
        }
      }, 20);
    });

  const supabase = await waitForSupabase();
  if (!supabase) {
    alert('Supabase 초기화 실패');
    return;
  }

  /* =====================
     draft ID
  ===================== */
  const params = new URLSearchParams(location.search);
  const draftId = params.get('draft');

  // ✅ confirm 페이지는 항상 "최종 발행 단계"
  window.__CONFIRM_MODE__ = true;

  // 버튼은 항상 최종 발행 버튼
  const backBtn = document.getElementById('backBtn');
  const publishBtn = document.getElementById('publishBtn');

  publishBtn.style.display = 'inline-flex';
  publishBtn.disabled = false;
  publishBtn.textContent = '최종 발행';

  // 검사 전용 플래그 완전 제거
  sessionStorage.removeItem('__DRAFT_CHECK_ONLY__');

  if (!draftId) {
    alert('임시 저장된 글이 없습니다.');
    location.href = 'write.html';
    return;
  }

  /* =====================
     🔐 세션 확인
  ===================== */
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;

  if (!user) {
    alert('로그인이 필요합니다.');
    location.href = 'login.html';
    return;
  }

  /* =====================
     draft 로드
  ===================== */
  const { data: draft, error } = await supabase
    .from('issues_draft')
    .select('*')
    .eq('id', draftId)
    .single();

  if (error || !draft) {
    alert('임시 글을 불러오지 못했습니다.');
    location.href = 'write.html';
    return;
  }

  /* =====================
     MOCK 검사 결과
  ===================== */
  // 🔥 검사 기능 비활성 상태: 로딩 제거 즉시 PASS 처리
  ['check-title','check-oneline','check-description'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('loading');
  });

  renderResult('check-title', 'PASS', '문제 없음');
  renderResult('check-oneline', 'PASS', '문제 없음');
  renderResult('check-description', 'PASS', '문제 없음');

  // 🔒 안전장치: confirm 진입 시 자동 발행 절대 금지
  if (!publishBtn) {
    console.warn('[confirm.js] publishBtn 없음 — 발행 불가');
    return;
  }

  /* =====================
     뒤로가기 (write / write-remix 분기)
  ===================== */
  backBtn.onclick = () => {
    // 🔒 정상 복귀 — draft 및 미디어 보존
    sessionStorage.setItem('__ALLOW_DRAFT_EXIT__', 'true');

    // remix draft면 write-remix로 복귀, 아니면 write로 복귀
    const isRemixDraft = !!draft.origin_issue_id;

    if (isRemixDraft) {
      location.href = `write-remix.html?draft=${draftId}`;
    } else {
      location.href = `write.html?draft=${draftId}`;
    }
  };

  /* =====================
     🔥 최종 발행 (미디어 이동 포함)
  ===================== */
  publishBtn.onclick = async () => {
    // Removed draft.draft_mode check per instructions

    __USER_CONFIRMED_PUBLISH__ = true;

    publishBtn.disabled = true;
    publishBtn.textContent = '발행 중…';

    try {
      const updates = {};
      const removePaths = [];

      /* ---------- 미디어 정리 ----------
         R2(Cloudflare) URL은 발행 시 이동이 필요 없음.
         레거시 Supabase Storage draft 파일만 public 경로로 복사. */
      const STORAGE_PREFIX = '/storage/v1/object/public/issues/';

      /* ---------- 썸네일 이동 (레거시 storage만) ---------- */
      if (draft.thumbnail_url && draft.thumbnail_url.includes(STORAGE_PREFIX)) {
        const oldPath = draft.thumbnail_url.split(STORAGE_PREFIX)[1];

        const ext = oldPath.split('.').pop();
        const newPath = `public/${draft.id}/thumbnail.${ext}`;

        const { error: copyErr } = await supabase
          .storage
          .from('issues')
          .copy(oldPath, newPath);

        if (copyErr) throw copyErr;

        updates.thumbnail_url =
          supabase.storage.from('issues').getPublicUrl(newPath).data.publicUrl;

        removePaths.push(oldPath);
      }

      /* ---------- 영상 이동 (레거시 storage만) ---------- */
      if (draft.video_url && draft.video_url.includes(STORAGE_PREFIX)) {
        const oldPath = draft.video_url.split(STORAGE_PREFIX)[1];

        const ext = oldPath.split('.').pop();
        const newPath = `public/${draft.id}/video.${ext}`;

        const { error: copyErr } = await supabase
          .storage
          .from('issues')
          .copy(oldPath, newPath);

        if (copyErr) throw copyErr;

        updates.video_url =
          supabase.storage.from('issues').getPublicUrl(newPath).data.publicUrl;

        removePaths.push(oldPath);
      }

      /* ---------- DB 발행: issues INSERT ---------- */
      const { data: published, error: insertError } = await supabase
        .from('issues')
        .insert([{
          user_id: draft.user_id,
          category: draft.category,
          title: draft.title,
          one_line: draft.one_line,
          description: draft.description,
          donation_target: draft.donation_target,
          is_anonymous: draft.is_anonymous,
          author_stance: draft.author_stance,
          origin_issue_id: draft.origin_issue_id,
          battle_type: draft.battle_type,
          thumbnail_url: updates.thumbnail_url ?? draft.thumbnail_url,
          video_url: updates.video_url ?? draft.video_url,
          images: draft.images ?? null,
          card_thumb_url: draft.card_thumb_url ?? null,
          faction_a: draft.faction_a ?? null,
          faction_b: draft.faction_b ?? null,
          status: 'normal',
          moderation_status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }])
        .select('id')
        .single();

      if (insertError || !published?.id) {
        throw insertError || new Error('issues 발행 INSERT 실패');
      }

      /* ---------- issues_draft 삭제 ---------- */
      const { error: deleteError } = await supabase
        .from('issues_draft')
        .delete()
        .eq('id', draft.id);

      if (deleteError) {
        throw deleteError;
      }

      /* ---------- draft 파일 제거 ---------- */
      if (removePaths.length > 0) {
        await supabase
          .storage
          .from('issues')
          .remove(removePaths);
      }

      /* ---------- 완료 ---------- */
      try { localStorage.removeItem('galla_draft_write'); } catch (_) {}   // 발행 성공 → 임시저장 비움
      location.href = `issue.html?id=${published.id}`;

    } catch (err) {
      console.error('[PUBLISH ERROR]', err);
      alert('발행 중 오류가 발생했습니다.');
      publishBtn.disabled = false;
      publishBtn.textContent = '최종 발행';
      __USER_CONFIRMED_PUBLISH__ = false;
    }
  };

  // 🔒 confirm 페이지 이탈은 발행으로 간주하지 않음
  window.addEventListener('beforeunload', () => {
    if (!__USER_CONFIRMED_PUBLISH__) {
      console.log('[confirm.js] 검사 페이지 이탈 — 발행 아님');
    }
  });
});

/* =====================
   UI Helper
===================== */
function renderResult(id, result, reason) {
  const el = document.getElementById(id);
  if (!el) return;

  el.classList.remove('loading');
  el.classList.add(result.toLowerCase());

  el.innerHTML = `
    <strong>${labelMap[id]}</strong><br>
    ${result} · ${reason}
  `;
}

const labelMap = {
  'check-title': '제목',
  'check-oneline': '한줄 요약',
  'check-description': '본문',
};