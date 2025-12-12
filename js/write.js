console.log("write.js loaded");

if (window.__WRITE_JS__) {
  console.warn("write.js already loaded - skipped");
}
window.__WRITE_JS__ = true;

document.addEventListener("DOMContentLoaded", () => {
  console.log("WRITE INIT");

  const form = document.getElementById("writeForm");
  const thumbnail = document.getElementById("thumbnail");
  const thumbnailBtn = document.getElementById("thumbnailBtn");
  const video = document.getElementById("videoInput");
  const videoBtn = document.getElementById("videoBtn");

  thumbnailBtn.onclick = () => thumbnail.click();
  videoBtn.onclick = () => video.click();

  /* ============================================================
     1) 이미지 업로드 → Supabase Storage (폴더 사용 X)
  ============================================================ */
  async function uploadImageToSupabase(file) {
    console.log("Uploading image to Supabase Storage...");

    const ext = file.name.split(".").pop();
    const fileName = `thumb_${Date.now()}.${ext}`; // ★ 슬래시(/) 절대 금지

    const { data, error } = await window.supabaseClient
      .storage
      .from("issues")
      .upload(fileName, file);

    if (error) {
      console.error("Supabase image upload error", error);
      throw new Error(error.message);
    }

    return fileName; // DB에는 파일명만 저장
  }

  /* ============================================================
     2) 비디오 업로드 → Supabase Storage
  ============================================================ */
  async function uploadVideoToSupabase(file) {
    console.log("Uploading video to Supabase Storage...");

    const ext = file.name.split(".").pop();
    const fileName = `video_${Date.now()}.${ext}`;

    const { data, error } = await window.supabaseClient
      .storage
      .from("issues")
      .upload(fileName, file);

    if (error) {
      console.error("Supabase video upload error", error);
      throw new Error(error.message);
    }

    return fileName;
  }

  /* ============================================================
     3) SUBMIT
  ============================================================ */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    try {
      const supabase = window.supabaseClient;

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        alert("로그인 해주세요");
        return;
      }

      let thumbId = null;
      let videoId = null;

      /* -----------------------------------------
         썸네일 업로드
      ----------------------------------------- */
      if (thumbnail.files[0]) {
        thumbId = await uploadImageToSupabase(thumbnail.files[0]);
      } else {
        alert("썸네일 이미지를 업로드해야 합니다.");
        return;
      }

      /* -----------------------------------------
         영상 업로드 (선택)
      ----------------------------------------- */
      if (video.files[0]) {
        videoId = await uploadVideoToSupabase(video.files[0]);
      }

      /* -----------------------------------------
         DB로 보낼 Issue 데이터 구성
      ----------------------------------------- */
      const issue = {
        category: document.getElementById("category").value,
        title: document.getElementById("title").value,
        oneLine: document.getElementById("oneLine").value,
        description: document.getElementById("description").value,
        thumbnail: thumbId,
        video: videoId,
        references: [
          document.getElementById("ref1").value || null,
          document.getElementById("ref2").value || null,
          document.getElementById("ref3").value || null
        ]
      };

      console.log("Sending issue to Edge Function:", issue);

      /* -----------------------------------------
         Supabase Edge Function 호출 (create-issue)
      ----------------------------------------- */
      const res = await fetch(
        "https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/create-issue",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(issue)
        }
      );

      const json = await res.json();
      if (!res.ok) {
        console.error("Create issue error:", json);
        throw new Error(json.message || "Issue 생성 실패");
      }

      alert("갈라 생성 완료!");
      location.href = `/issue.html?id=${json.id}`;

    } catch (err) {
      console.error("FINAL ERROR:", err);
      alert("오류: " + err.message);
    }
  });
});