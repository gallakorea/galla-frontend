console.log("write.js loaded");

// 중복 방지
if (window.__WRITE_JS__) return;
window.__WRITE_JS__ = true;

document.addEventListener("DOMContentLoaded", () => {

  console.log("WRITE INIT START");

  const CF_ACCOUNT_ID   = window.CF_ACCOUNT_ID;
  const CF_IMAGES_TOKEN = window.CF_IMAGES_TOKEN;
  const CF_STREAM_TOKEN = window.CF_STREAM_TOKEN;

  if (!CF_ACCOUNT_ID || !CF_IMAGES_TOKEN) {
    console.error("Cloudflare ENV not loaded");
    return;
  }

  /* DOM */
  const form = document.getElementById("writeForm");
  const thumbnail = document.getElementById("thumbnail");
  const thumbnailBtn = document.getElementById("thumbnailBtn");

  const video = document.getElementById("videoInput");
  const videoBtn = document.getElementById("videoBtn");

  /* 입력 버튼 활성화 */
  thumbnailBtn.onclick = () => thumbnail.click();
  videoBtn.onclick = () => video.click();


  /* ==============================
     Cloudflare Images Upload
     ============================== */
  async function uploadImage(file) {
    console.log("IMAGE UPLOAD…");

    const url =
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v1/direct_upload`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CF_IMAGES_TOKEN}`
      }
    });

    const json = await res.json();
    const uploadURL = json?.result?.uploadURL;

    const up = await fetch(uploadURL, {
      method: "POST",
      body: file
    });

    const uploaded = await up.json();
    return uploaded?.result?.id;
  }


  /* ==============================
     Cloudflare Stream Upload
     ============================== */
  async function uploadVideo(file) {
    console.log("VIDEO UPLOAD…");

    const url =
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/direct_upload`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CF_STREAM_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        maxDurationSeconds: 120
      })
    });

    const json = await res.json();
    const uploadURL = json.result.uploadURL;

    await fetch(uploadURL, {
      method: "PUT",
      body: file
    });

    return json.result.uid;
  }


  /* ==============================
     FORM SUBMIT
     ============================== */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    try {
      const supabase = window.supabaseClient;

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        alert("로그인 후 이용해주세요.");
        return;
      }

      const thumbId = await uploadImage(thumbnail.files[0]);
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
          document.getElementById("ref3").value || null,
        ]
      };

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
      alert("오류 발생: " + err.message);
    }
  });

});