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

  /* -------------------- Cloudflare IMAGE Upload (FIXED) -------------------- */
  async function uploadImage(file) {
    console.log("Requesting image upload URL...");

    const res = await fetch(
      "https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/get-image-upload-url",
      { method: "POST" }
    );

    const json = await res.json();
    const uploadURL = json?.result?.uploadURL;
    if (!uploadURL) throw new Error("이미지 업로드 URL 없음");

    console.log("Uploading image…");

    const formData = new FormData();
    formData.append("file", file);

    const uploadRes = await fetch(uploadURL, {
      method: "POST",
      body: formData
    });

    const uploaded = await uploadRes.json();
    if (!uploaded?.result?.id) {
      console.error(uploaded);
      throw new Error("이미지 업로드 실패");
    }

    return uploaded.result.id;
  }

  /* -------------------- Cloudflare VIDEO Upload (FIXED) -------------------- */
  async function uploadVideo(file) {
    console.log("Requesting video upload URL...");

    const res = await fetch(
      "https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/get-video-upload-url",
      { method: "POST" }
    );

    const json = await res.json();
    const uploadURL = json?.result?.uploadURL;
    const uid = json?.result?.uid;

    if (!uploadURL) throw new Error("비디오 업로드 URL 없음");

    console.log("Uploading video…");

    const formData = new FormData();
    formData.append("file", file);

    const uploadRes = await fetch(uploadURL, {
      method: "POST",
      body: formData
    });

    if (!uploadRes.ok) {
      console.error(await uploadRes.text());
      throw new Error("비디오 업로드 실패");
    }

    return uid;
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

      let thumbId = null;
      let videoId = null;

      if (thumbnail.files[0]) {
        thumbId = await uploadImage(thumbnail.files[0]);
      } else {
        alert("썸네일은 필수입니다.");
        return;
      }

      if (video.files[0]) {
        videoId = await uploadVideo(video.files[0]);
      }

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

      console.log("Sending issue:", issue);

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