document.addEventListener("DOMContentLoaded", async () => {
  console.log("[account-edit.js] loaded");

  // Supabase client wait
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

  // Session check
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;

  if (!session?.user) {
    alert("로그인이 필요합니다.");
    location.href = "login.html";
    return;
  }

  const userId = session.user.id;

  const input = document.getElementById("profileInput");
  const preview = document.getElementById("profilePreview");
  const saveBtn = document.querySelector(".save-btn");

  let selectedFile = null;

  // Preview image
  input.addEventListener("change", () => {
    const file = input.files[0];
    if (!file) return;

    selectedFile = file;
    preview.src = URL.createObjectURL(file);
  });

  // Save handler
  saveBtn.addEventListener("click", async () => {
    try {
      let avatarUrl = null;

      // 1. Upload image if selected
      if (selectedFile) {
        if (!selectedFile.type.startsWith("image/")) {
          alert("이미지 파일만 업로드 가능합니다.");
          return;
        }

        const filePath = `${userId}/avatar.jpg`;

        let uploadError = null;

        // 1차: upload 시도
        const uploadResult = await supabase.storage
          .from("profiles")
          .upload(filePath, selectedFile, {
            cacheControl: "3600",
            upsert: false
          });

        uploadError = uploadResult.error;

        // 2차: 이미 존재하면 update
        if (uploadError && uploadError.statusCode === 409) {
          console.warn("file exists, retrying with update");

          const updateResult = await supabase.storage
            .from("profiles")
            .update(filePath, selectedFile, {
              cacheControl: "3600"
            });

          uploadError = updateResult.error;
        }

        if (uploadError) {
          console.error("storage upload failed:", uploadError.message, uploadError.statusCode);
          alert("사진 업로드 실패");
          return;
        }

        const { data: publicUrlData } = supabase.storage
          .from("profiles")
          .getPublicUrl(filePath);

        avatarUrl = publicUrlData.publicUrl;
        preview.src = avatarUrl;
      }

      // 2. Update users table (account profile)
      const nickname = document.getElementById("nicknameInput")?.value || null;
      const bio = document.getElementById("bioInput")?.value || null;
      const phone = document.getElementById("phoneInput")?.value || null;

      const updatePayload = {};

      if (nickname !== null) updatePayload.nickname = nickname;
      if (bio !== null) updatePayload.bio = bio;
      if (phone !== null) updatePayload.phone = phone;
      if (avatarUrl) updatePayload.avatar_url = avatarUrl;

      console.log("updatePayload:", updatePayload);

      const { error: updateError } = await supabase
        .from("users")
        .update(updatePayload)
        .eq("id", userId);

      if (updateError) {
        console.error("profile update error", updateError);
        alert("프로필 저장 실패");
        return;
      }

      alert("계정 정보가 저장되었습니다.");
      history.back();

    } catch (e) {
      console.error("unexpected error", e);
      alert("오류가 발생했습니다.");
    }
  });
});