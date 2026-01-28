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

      // 1. Upload image if selected (FINAL FIX – single upload only)
      if (selectedFile) {
        if (!selectedFile.type.startsWith("image/")) {
          alert("이미지 파일만 업로드 가능합니다.");
          return;
        }

        const filePath = `${userId}/avatar.jpg`;

        // Convert to JPEG Blob
        const jpegBlob = await (async () => {
          const img = new Image();
          const url = URL.createObjectURL(selectedFile);
          img.src = url;

          await new Promise((res, rej) => {
            img.onload = res;
            img.onerror = rej;
          });

          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);

          return await new Promise((res, rej) => {
            canvas.toBlob(
              blob => (blob ? res(blob) : rej(new Error("toBlob failed"))),
              "image/jpeg",
              0.9
            );
          });
        })();

        const { error: uploadError } = await supabase.storage
          .from("profiles")
          .upload(filePath, jpegBlob, {
            upsert: true,
            contentType: "image/jpeg"
          });

        if (uploadError) {
          console.error("storage upload error:", uploadError);
          throw uploadError;
        }

        avatarUrl = filePath; // store path only, not public URL

        // 🔥 즉시 미리보기 반영 (public URL)
        const { data: publicUrlData } = supabase
          .storage
          .from("profiles")
          .getPublicUrl(filePath);

        if (publicUrlData?.publicUrl) {
          preview.src = publicUrlData.publicUrl + `?t=${Date.now()}`;
        }
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

      console.log("[account-edit] saved avatar_url:", avatarUrl);
      alert("계정 정보가 저장되었습니다.");
      history.back();

    } catch (e) {
      console.error("unexpected error", e);
      alert("오류가 발생했습니다.");
    }
  });
});