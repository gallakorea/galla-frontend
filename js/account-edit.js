document.addEventListener("DOMContentLoaded", async () => {
  console.log("[account-edit.js] loaded");

  // =========================
  // Supabase client wait
  // =========================
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

  // =========================
  // Session check
  // =========================
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;

  if (!session?.user) {
    alert("로그인이 필요합니다.");
    location.href = "login.html";
    return;
  }

  const userId = session.user.id;

  // =========================
  // DOM refs
  // =========================
  const fileInput = document.getElementById("profileInput");
  const previewImg = document.getElementById("profilePreview");
  const saveBtn = document.getElementById("saveBtn");

  const nicknameInput = document.getElementById("nickname");
  const bioInput = document.getElementById("bio");

  let selectedFile = null;

  // =========================
  // Image preview only (NO upload here)
  // =========================
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 선택할 수 있습니다.");
      fileInput.value = "";
      return;
    }

    selectedFile = file;
    previewImg.src = URL.createObjectURL(file);
  });

  // =========================
  // Save handler (single source of truth)
  // =========================
  saveBtn.addEventListener("click", async () => {
    try {
      const updatePayload = {};

      // ---------
      // 1. Image upload (ONLY here)
      // ---------
      if (selectedFile) {
        const filePath = `${userId}/avatar.jpg`;

        const jpegBlob = await new Promise((resolve, reject) => {
          const img = new Image();
          const url = URL.createObjectURL(selectedFile);
          img.src = url;

          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);

            canvas.toBlob(
              blob => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
              "image/jpeg",
              0.9
            );
          };

          img.onerror = reject;
        });

        const { error: uploadError } = await supabase.storage
          .from("profiles")
          .upload(filePath, jpegBlob, {
            upsert: true,
            contentType: "image/jpeg"
          });

        if (uploadError) {
          console.error("[account-edit] storage upload error", uploadError);
          alert("이미지 업로드 실패");
          return;
        }

        updatePayload.avatar_url = filePath;
      }

      // ---------
      // 2. Text fields
      // ---------
      const nickname = nicknameInput.value.trim();
      const bio = bioInput.value.trim();

      if (nickname) updatePayload.nickname = nickname;
      updatePayload.bio = bio;

      if (Object.keys(updatePayload).length === 0) {
        alert("변경된 내용이 없습니다.");
        return;
      }

      // ---------
      // 3. Update users table (ONLY)
      // ---------
      const { error: updateError } = await supabase
        .from("users")
        .update(updatePayload)
        .eq("id", userId);

      if (updateError) {
        console.error("[account-edit] users update error", updateError);
        alert("프로필 저장 실패");
        return;
      }

      alert("계정 정보가 저장되었습니다.");
      location.href = "mypage.html";

    } catch (err) {
      console.error("[account-edit] unexpected error", err);
      alert("오류가 발생했습니다.");
    }
  });
});