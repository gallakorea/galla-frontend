console.log("write.js loaded");

// Prevent duplicate execution
if (window.__WRITE_JS_LOADED__) {
  console.warn("write.js already loaded → prevented duplicate run");
  return;   // ★★★ 반드시 있어야 함
}
window.__WRITE_JS_LOADED__ = true;

document.addEventListener("DOMContentLoaded", () => {
  console.log("WRITE INIT");

  /* ==================================================
     1) ENV
  ================================================== */
  const CF_ACCOUNT_ID   = window.CF_ACCOUNT_ID;
  const CF_IMAGES_TOKEN = window.CF_IMAGES_TOKEN;
  const CF_STREAM_TOKEN = window.CF_STREAM_TOKEN;

  /* ==================================================
     2) DOM Elements
  ================================================== */
  const form = document.getElementById("writeForm");
  const thumbnail = document.getElementById("thumbnail");
  const thumbnailBtn = document.getElementById("thumbnailBtn");
  const video = document.getElementById("videoInput");
  const videoBtn = document.getElementById("videoBtn");

  if (!form || !thumbnailBtn || !thumbnail || !video || !videoBtn) {
    console.error("WRITE PAGE INIT FAILED: Some elements not found.");
    return;
  }

  thumbnailBtn.addEventListener("click", () => thumbnail.click());
  videoBtn.addEventListener("click", () => video.click());

  /* ==================================================
     3) Cloudflare Images Upload
  ================================================== */
  async function uploadImage(file) {
    if (!file) throw new Error("이미지 파일 없음");

    // Direct upload URL 생성
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v1/direct_upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CF_IMAGES_TOKEN}`
        }
      }
    );

    const json = await res.json();
    if (!json.success) throw new Error("CF 이미지 업로드 URL 생성 실패");

    const uploadURL = json.result.uploadURL;

    // 실제 파일 업로드
    const uploadRes = await fetch(uploadURL, {
      method: "POST",
      body: file
    });

    const uploaded = await uploadRes.json();
    if (!uploaded.success) throw new Error("이미지 업로드 실패");

    return uploaded.result.id;
  }

  /* ==================================================
     4) Cloudflare Stream Upload
  ================================================== */
  async function uploadVideo(file) {
    if (!file) return null;

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/direct_upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CF_STREAM_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ maxDurationSeconds: 120 })
      }
    );

    const json = await res.json();
    if (!json.success) throw new Error("CF 영상 업로드 URL 생성 실패");

    const uploadURL = json.result.uploadURL;

    await fetch(uploadURL, {
      method: "PUT",
      body: file
    });

    return json.result.uid;
  }

  /* ==================================================
     5) Submit Handler
  ================================================== */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    try {
      const supabase = window.supabaseClient;
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        alert("로그인이 필요합니다.");
        return;
      }

      const thumbFile = thumbnail.files[0];
      if (!thumbFile) {
        alert("썸네일을 업로드해주세요.");
        return;
      }

      const thumbId = await uploadImage(thumbFile);
      const videoId = video.files[0] ? await uploadVideo(video.files[0]) : null;

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
        ],
      };

      // Edge Function 호출
      const res = await fetch(
        "https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/create-issue",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(issue)
        }
      );

      const json = await res.json();
      if (!res.ok) throw new Error(json.message);

      alert("갈라 생성 성공!");
      location.href = `/issue.html?id=${json.id}`;

    } catch (err) {
      console.error(err);
      alert("오류 발생: " + err.message);
    }
  });
});