console.log("write.js loaded");

if (window.__WRITE_JS__) {
  console.warn("write.js already loaded - skipped");
}
window.__WRITE_JS__ = true;

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("writeForm");
  const thumbnail = document.getElementById("thumbnail");
  const thumbnailBtn = document.getElementById("thumbnailBtn");
  const video = document.getElementById("videoInput");
  const videoBtn = document.getElementById("videoBtn");

  thumbnailBtn.onclick = () => thumbnail.click();
  videoBtn.onclick = () => video.click();

  async function uploadThumbnail(issueId, file) {
    const ext = file.name.split(".").pop().toLowerCase();
    const path = `thumbnails/${issueId}.${ext}`;

    const { error } = await window.supabaseClient
      .storage
      .from("issues")
      .upload(path, file, { contentType: file.type });

    if (error) throw error;
    return path;
  }

  async function uploadVideo(issueId, file) {
    const ext = file.name.split(".").pop().toLowerCase();
    const path = `videos/${issueId}.${ext}`;

    const { error } = await window.supabaseClient
      .storage
      .from("issues")
      .upload(path, file, { contentType: file.type });

    if (error) throw error;
    return path;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const supabase = window.supabaseClient;
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    if (!user) {
      alert("로그인이 필요합니다");
      return;
    }

    if (!thumbnail.files[0]) {
      alert("썸네일은 필수입니다");
      return;
    }

    try {
      /* 1️⃣ issues INSERT */
      const { data: issue, error: insertError } = await supabase
        .from("issues")
        .insert({
          user_id: user.id,
          category: document.getElementById("category").value,
          title: document.getElementById("title").value,
          one_line: document.getElementById("oneLine").value,
          description: document.getElementById("description").value,
          references: [
            document.getElementById("ref1").value || null,
            document.getElementById("ref2").value || null,
            document.getElementById("ref3").value || null
          ]
        })
        .select()
        .single();

      if (insertError) throw insertError;

      /* 2️⃣ Storage 업로드 */
      const thumbnailPath = await uploadThumbnail(issue.id, thumbnail.files[0]);
      let videoPath = null;

      if (video.files[0]) {
        videoPath = await uploadVideo(issue.id, video.files[0]);
      }

      /* 3️⃣ issues UPDATE */
      await supabase
        .from("issues")
        .update({
          thumbnail_url: thumbnailPath,
          video_url: videoPath
        })
        .eq("id", issue.id);

      alert("갈라 발행 완료");
      location.href = `/issue.html?id=${issue.id}`;

    } catch (err) {
      console.error(err);
      alert("오류 발생: " + err.message);
    }
  });
});