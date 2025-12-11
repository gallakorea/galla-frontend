// auth.js — 모든 페이지 공통 인증 상태 관리

async function loadAuthState() {
    const supabase = window.supabaseClient;

    // 현재 세션 확인
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
        console.log("로그인 상태:", session.user);
        window.currentUser = session.user;

        document.body.classList.add("logged-in");
        document.body.classList.remove("logged-out");

        // 프로필 로드
        loadUserProfile();
    } else {
        console.log("비로그인 상태");
        window.currentUser = null;

        document.body.classList.add("logged-out");
        document.body.classList.remove("logged-in");
    }
}

// 로그인한 사용자 프로필 불러오기
async function loadUserProfile() {
    const supabase = window.supabaseClient;
    if (!window.currentUser) return;

    const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", window.currentUser.id)
        .single();

    if (error) {
        console.warn("프로필 로드 실패:", error);
        return;
    }

    console.log("프로필 데이터:", data);

    const nicknameEl = document.getElementById("nickname");
    if (nicknameEl) nicknameEl.textContent = data.nickname;
}

// 로그아웃 기능
document.addEventListener("click", async (e) => {
    if (e.target.id === "logoutBtn") {
        await window.supabaseClient.auth.signOut();
        location.reload();
    }
});

// 페이지 로딩 시 실행
document.addEventListener("DOMContentLoaded", loadAuthState);