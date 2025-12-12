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

  /* -------------------- Cloudflare IMAGE Upload -------------------- */
  async function uploadImage(file) {
    console.log("Requesting image upload URL...");

    const res = await fetch(
      "https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/get-image-upload-url",
      { method: "POST" }
    );

    if (!res.ok) {
      throw new Error("Failed to get Image Upload URL");
    }

    const json = await res.json();
    const uploadURL = json?.result?.uploadURL;

    if (!uploadURL) {
      throw new Error("Image uploadURL not found");
    }

    console.log("Uploading image...");

    const formData = new FormData();
    formData.append("file", file);

    const uploadRes = await fetch(uploadURL, {
      method: "POST",
      body: formData
    });

    const uploaded = await uploadRes.json();

    if (!uploaded?.result?.id) {
      console.error(uploaded);
      throw new Error("Cloudflare Images upload failed");
    }

    return uploaded.result.id;
  }

  /* -------------------- Cloudflare VIDEO Upload -------------------- */
  async function uploadVideo(file) {
    console.log("Requesting video upload URL...");

    const res = await fetch(
      "https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/get-video-upload-url",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxDurationSeconds: 120 })
      }
    );

    if (!res.ok) throw new Error("Failed to get Video Upload URL");

    const json = await res.json();
    const uploadURL = json?.result?.uploadURL;

    if (!uploadURL) throw new Error("Video uploadURL not found");

    console.log("Uploading video...");

    const uploadRes = await fetch(uploadURL, {
      method: "PUT",
      body: file
    });

    if (!uploadRes.ok) throw new Error("Cloudflare Stream upload failed");

    return json.result.uid;
  }

  /* ----------------------------- SUBMIT ----------------------------- */
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

      /* 1) 이미지 업로드 */
      const thumbFile = thumbnail.files[0];
      if (!thumbFile) throw new Error("썸네일은 필수입니다.");

      const thumbId = await uploadImage(thumbFile);

      /* 2) 비디오 업로드(선택) */
      const videoId = video.files[0] ? await uploadVideo(video.files[0]) : null;

      /* 3) Issue payload 구성 */
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

      /* 4) Supabase Edge Function 호출 */
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
      if (!res.ok) throw new Error(json.message);

      alert("갈라 생성 완료!");
      location.href = `/issue.html?id=${json.id}`;

    } catch (err) {
      console.error(err);
      alert("오류: " + err.message);
    }
  });
});