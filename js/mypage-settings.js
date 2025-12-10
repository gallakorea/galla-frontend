/* ===========================================================
   mypage-settings.js
   - 프로필 수정
   - 이미지 업로드 미리보기
   - 닉네임/소개 저장
   - 로그아웃 / 계정삭제
=========================================================== */

/* -----------------------------------------------------------
   DOM Elements
----------------------------------------------------------- */
const avatarInput = document.querySelector("#settingsAvatarInput");
const avatarImg = document.querySelector(".settings-avatar");

const nameInput = document.querySelector("#settingsName");
const bioInput = document.querySelector("#settingsBio");

const saveBtn = document.querySelector(".settings-save-btn");
const logoutBtn = document.querySelector(".logout-btn");
const deleteBtn = document.querySelector(".delete-account-btn");

/* -----------------------------------------------------------
   1) 프로필 이미지 미리보기
----------------------------------------------------------- */
avatarInput?.addEventListener("change", () => {
    const file = avatarInput.files[0];
    if (!file) return;
    avatarImg.src = URL.createObjectURL(file);
});

/* -----------------------------------------------------------
   2) 임시 저장(localStorage)
----------------------------------------------------------- */
function saveSettings() {
    const data = {
        name: nameInput.value,
        bio: bioInput.value
    };

    localStorage.setItem("galla_user_settings", JSON.stringify(data));
    alert("저장되었습니다!");
}

saveBtn?.addEventListener("click", saveSettings);

/* -----------------------------------------------------------
   3) 저장된 설정 로드
----------------------------------------------------------- */
window.addEventListener("DOMContentLoaded", () => {
    const saved = localStorage.getItem("galla_user_settings");
    if (!saved) return;

    try {
        const data = JSON.parse(saved);
        nameInput.value = data.name || "";
        bioInput.value = data.bio || "";
    } catch (e) {}
});

/* -----------------------------------------------------------
   4) 로그아웃
----------------------------------------------------------- */
logoutBtn?.addEventListener("click", () => {
    alert("로그아웃 되었습니다.");
    // 실제: supabase.auth.signOut()
    window.location.href = "auth.html";
});

/* -----------------------------------------------------------
   5) 계정 삭제
----------------------------------------------------------- */
deleteBtn?.addEventListener("click", () => {
    if (confirm("정말 계정을 삭제하시겠습니까?")) {
        alert("계정 삭제 요청 완료되었습니다.");
        // 실제 API: supabase.from("users").delete().eq("id", userId)
    }
});