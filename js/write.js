console.log("write.js loaded");

if (window.__WRITE_JS_LOADED__) {
  console.warn("write.js duplicated, ignored");
  throw new Error("write.js duplicated load");
}
window.__WRITE_JS_LOADED__ = true;

/* DOM */
const form = document.getElementById("writeForm");
const category = document.getElementById("category");
const title = document.getElementById("title");
const oneLine = document.getElementById("oneLine");
const description = document.getElementById("description");

const ref1 = document.getElementById("ref1");
const ref2 = document.getElementById("ref2");
const ref3 = document.getElementById("ref3");

const thumbnailInput = document.getElementById("thumbnail");
const thumbnailBtn = document.getElementById("thumbnailBtn");

const videoInput = document.getElementById("videoInput");
const videoBtn = document.getElementById("openVideoEditor");

/* Cloudflare ENV 검사 */
function checkEnv() {
  if (!window.CF_ACCOUNT_ID) throw new Error("CF_ACCOUNT_ID missing");
  if (!window.CF_IMAGES_TOKEN) throw new Error("CF_IMAGES_TOKEN missing");
  if (!window.CF_STREAM_TOKEN) throw new Error("CF_STREAM_TOKEN missing");
}
checkEnv();

/* Upload Buttons */
thumbnailBtn.addEventListener("click", () => thumbnailInput.click());
videoBtn.addEventListener("click", () => videoInput.click());

/* Image Upload */
async function uploadImage(file) {
  if (!file) return null;

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v1/direct_upload`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + CF_IMAGES_TOKEN,
    },
  });

  const json = await res.json();
  if (!json.success) throw new Error("CF Images URL error");

  const uploadURL = json.result.uploadURL;

  const uploadRes = await fetch(uploadURL, {
    method: "POST",
    body: file,
  });

  const uploadJson = await uploadRes.json();
  if (!uploadJson.result?.id) throw new Error("이미지 업로드 실패");

  return uploadJson.result.id;
}

/* Stream Upload */
async function uploadVideo(file) {
  if (!file) return null;

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/direct_upload`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + CF_STREAM_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      maxDurationSeconds: 120,
      requireSignedURLs: false,
    }),
  });

  const json = await res.json();
  if (!json.success) throw new Error("CF Stream URL error");

  const uploadURL = json.result.uploadURL;

  const uploadRes = await fetch(uploadURL, {
    method: "PUT",
    body: file,
  });

  if (!uploadRes.ok) throw new Error("영상 업로드 실패");

  return json.result.uid;
}

/* Submit */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    const supabase = window.supabaseClient;

    const thumbFile = thumbnailInput.files[0];
    const videoFile = videoInput.files[0];

    const thumbnailId = await uploadImage(thumbFile);
    const videoId = videoFile ? await uploadVideo(videoFile) : null;

    alert("업로드 성공, 이제 DB 저장 로직 연결하면 끝");

  } catch (err) {
    console.error(err);
    alert("오류: " + err.message);
  }
});