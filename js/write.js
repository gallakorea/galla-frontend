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

  /* -------------------- Supabase IMAGE Upload -------------------- */
  async function uploadImage(file) {
    console.log("Uploading image to Supabase Storage...");

    const supabase = window.supabaseClient;

    const filePath = `thumbnails/${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage
      .from("issues")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error(error);
      throw new Error("이미지 업로드 실패");
    }

    // Public URL 만들기
    const { data: urlData } = supabase.storage
      .from("issues")
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  }

  /* -------------------- Supabase VIDEO Upload -------------------- */
  async function uploadVideo(file) {
    console.log("Uploading video to Supabase Storage...");

    const supabase = window.supabaseClient;

    const filePath = `videos/${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage
      .from("issues")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error(error);
      throw new Error("비디오 업로드 실패");
    }

    // Public URL 만들기
    const { data: urlData } = supabase.storage
      .from("issues")
      .getPublicUrl(filePath);

    return urlData.publicUrl;
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

      let thumbnailUrl = null;
      let videoUrl = null;

      if (thumbnail.files[0]) {
        thumbnailUrl = await uploadImage(thumbnail.files[0]);
      } else {
        alert("썸네일은 필수입니다.");
        return;
      }

      if (video.files[0]) {
        videoUrl = await uploadVideo(video.files[0]);
      }

      const issue = {
        category: document.getElementById("category").value,
        title: document.getElementById("title").value,
        oneLine: document.getElementById("oneLine").value,
        description: document.getElementById("description").value,
        thumbnail: thumbnailUrl,
        video: videoUrl,
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
            "Content-Type": "application/json",
          },
          body: JSON.stringify(issue),
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