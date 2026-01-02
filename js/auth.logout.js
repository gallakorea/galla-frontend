// js/auth.logout.js
window.gallaLogout = async function () {
  if (!window.supabaseClient) {
    alert('Supabase 연결 오류');
    return;
  }

  const ok = confirm('로그아웃 하시겠습니까?');
  if (!ok) return;

  const { error } = await window.supabaseClient.auth.signOut();

  if (error) {
    console.error('[LOGOUT ERROR]', error);
    alert('로그아웃 실패');
    return;
  }

  // 🔥 핵심: 모든 임시 상태 제거
  sessionStorage.clear();
  localStorage.clear();

  alert('로그아웃되었습니다.');
  location.href = 'index.html';
};