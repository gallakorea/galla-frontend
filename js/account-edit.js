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
    (window.GALLA_nav||function(u){location.href=u})("login.html");
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
  const nickCount = document.getElementById("nickCount");
  const bioCount = document.getElementById("bioCount");

  const emailField = document.getElementById("emailField");
  const phoneField = document.getElementById("phoneField");

  // 🤖 갈비스 딥링크(?focus=) — 프로필 항목을 바로 열/포커스(사진은 파일 선택창까지)
  try {
    const focus = new URLSearchParams(location.search).get("focus");
    if (focus) setTimeout(() => {
      if (focus === "photo") { fileInput && fileInput.click(); }
      else if (focus === "nickname") { nicknameInput && (nicknameInput.focus(), nicknameInput.scrollIntoView({ block: "center" })); }
      else if (focus === "bio") { bioInput && (bioInput.focus(), bioInput.scrollIntoView({ block: "center" })); }
      else if (focus === "phone") { phoneField && (phoneField.focus(), phoneField.scrollIntoView({ block: "center" })); }
    }, 500);
  } catch (_) {}

  let selectedFile = null;

  // 글자수 카운터
  const syncCounts = () => {
    if (nickCount) nickCount.textContent = nicknameInput.value.length;
    if (bioCount) bioCount.textContent = bioInput.value.length;
  };
  nicknameInput.addEventListener("input", syncCounts);
  bioInput.addEventListener("input", syncCounts);

  // 전화번호 자동 하이픈 포맷 (010-0000-0000)
  const formatPhone = (v) => {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return d.slice(0, 3) + "-" + d.slice(3);
    return d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7);
  };
  phoneField.addEventListener("input", () => {
    phoneField.value = formatPhone(phoneField.value);
  });

  // =========================
  // Load existing profile
  // =========================
  // PII(phone) 포함 → 직접 users 조회 대신 본인전용 RPC
  const { data: profile, error: profileError } = await supabase.rpc("get_my_account");

  if (profileError) {
    console.error("[account-edit] load profile error", profileError);
  } else if (profile) {
    nicknameInput.value = profile.nickname || "";
    // 실시간 중복 확인 — 지금 쓰는 닉네임은 '내 것'으로 통과시킨다
    window.__nickOriginal = profile.nickname || "";
    window.__nickCheck = window.GALLA_bindNickCheck?.(nicknameInput, { current: window.__nickOriginal });
    bioInput.value = profile.bio || "";
    syncCounts();

    if (emailField) {
      // 🟢 소셜 로그인이 이메일을 안 주면 내부용 합성 주소(naver_xxx@galla.social)를 쓴다 —
      //    유저에겐 의미 없는 문자열이라 그대로 보여주면 "가입 이메일이 이상하다"가 된다. 연결 표시로 대체.
      const em = session.user.email || "";
      emailField.textContent = /@galla\.social$/.test(em) ? "네이버 계정으로 로그인 중" : (em || "-");
    }

    if (phoneField) {
      phoneField.value = profile.phone ? formatPhone(profile.phone) : "";
    }

    window.GALLA_setAvatar(previewImg, profile.avatar_url, 256, true);
  }

  // =========================
  // Image preview only
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
  // Save handler
  // =========================
  saveBtn.addEventListener("click", async () => {
    try {
      const updatePayload = {};

      // 1) Image upload
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

      // 2) Text fields
      const nickname = nicknameInput.value.trim();
      const bio = bioInput.value.trim();

      if (nickname) {
        // 서버가 최종 판정하지만, 확인이 '사용 불가'로 나온 상태면 여기서 멈춘다(왕복 낭비 방지)
        if (window.__nickCheck && window.__nickCheck.state.ok === false && nickname !== window.__nickOriginal) {
          alert(document.querySelector('.nick-stat')?.textContent || '닉네임을 다시 확인해주세요');
          return;
        }
        updatePayload.nickname = nickname;
      }
      updatePayload.bio = bio;

      // 전화번호: 숫자만 저장. 입력이 있으면 10~11자리 검증
      const phoneDigits = phoneField.value.replace(/\D/g, "");
      if (phoneDigits && !/^01[0-9]{8,9}$/.test(phoneDigits)) {
        alert("전화번호 형식이 올바르지 않습니다. (예: 010-1234-5678)");
        return;
      }
      updatePayload.phone = phoneDigits || null;

      if (Object.keys(updatePayload).length === 0) {
        alert("변경된 내용이 없습니다.");
        return;
      }

      // 3) Update users table
      const { error: updateError } = await supabase
        .from("users")
        .update(updatePayload)
        .eq("id", userId);

      if (updateError) {
        console.error("[account-edit] users update error", updateError);
        // 닉네임 제약 위반은 사람 말로 — '저장 실패'만 뜨면 원인을 알 수 없다
        const nickMsg = window.GALLA_nickError?.(updateError);
        alert(nickMsg || "프로필 저장 실패");
        return;
      }

      alert("계정 정보가 저장되었습니다.");
      (window.GALLA_nav||function(u){location.href=u})("mypage.html");

    } catch (err) {
      console.error("[account-edit] unexpected error", err);
      alert("오류가 발생했습니다.");
    }
  });
});