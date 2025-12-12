/* ============================================================
   WRITE PAGE – FINAL VERIFIED VERSION
   Cloudflare Images + Stream → Supabase Edge Function 경유
   ============================================================ */

console.log("write.js loaded");

// 클릭 이벤트 중복 방지
if (window.__WRITE_JS_LOADED__) {
  console.warn("write.js already loaded → skipped");
} else {
  window.__WRITE_JS_LOADED__ = true;
}

/* ------------------------------------------------------------
   DOM 요소
------------------------------------------------------------ */
const form = document.getElementById("writeForm");
const category = document.getElementById("category");
const titleField = document.getElementById("title");
const oneLine = document.getElementById("oneLine");
const description = document.getElementById("description");
const ref1 = document.getElementById("ref1");
const ref2 = document.getElementById("ref2");
const ref3 = document.getElementById("ref3");

const thumbnailInput = document.getElementById("thumbnail");
const thumbnailBtn = document.getElementById("thumbnailBtn");

const videoInput = document.getElementById("videoInput");
const videoBtn = document.getElementById("openVideoEditor");

/* ------------------------------------------------------------
   버튼 → 숨겨진 input 클릭
------------------------------------------------------------ */
thumbnailBtn.addEventListener("click", () => thumbnailInput.click());
videoBtn.addEventListener("click", () => videoInput.click());

/* ------------------------------------------------------------
   A) 이미지 업로드 URL 발급 (Edge → Cloudflare)
------------------------------------------------------------ */
async function getImageUploadURL() {
  const url =
    "https://bidqauputnhkqepvdzrr.functions.supabase.co/get-image-upload-url";

  const res = await fetch(url);
  const json = await res.json();

  if (!json.success) throw new Error("Cloudflare 이미지 업로드 URL 실패");

  return json.result.uploadURL;
}

/* ------------------------------------------------------------
   B) 영상 업로드 URL 발급 (Edge → Cloudflare Stream)
------------------------------------------------------------ */
async function getVideoUploadURL() {
  const url =
    "https://bidqauputnhkqepvdzrr.functions.supabase.co/get-video-upload-url";

  const res = await fetch(url);
  const json = await res.json();

  if (!json.success) throw new Error("Cloudflare 영상 업로드 URL 실패");

  return { uploadURL: json.result.uploadURL, uid: json.result.uid };
}

/* ------------------------------------------------------------
   실제 이미지 업로드
------------------------------------------------------------ */
async function uploadImage(file) {
  if (!file) return null;

  console.log("이미지 업로드 요청중...");

  const uploadURL = await getImageUploadURL();

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(uploadURL, {
    method: "POST",
    body: formData,
  });

  const json = await res.json();
  console.log("이미지 업로드 결과:", json);

  if (!json?.result?.id) throw new Error("Cloudflare 이미지 업로드 실패");

  return json.result.id; // 이미지 ID 리턴
}

/* ------------------------------------------------------------
   실제 영상 업로드
------------------------------------------------------------ */
async function uploadVideo(file) {
  if (!file) return null;

  console.log("영상 업로드 요청중...");

  const { uploadURL, uid } = await getVideoUploadURL();

  const res = await fetch(uploadURL, {
    method: "PUT",
    body: file,
  });

  if (!res.ok) throw new Error("Cloudflare 영상 업로드 실패");

  return uid; // Stream video UID 리턴
}

/* ------------------------------------------------------------
   Supabase DB 저장 (Edge Function)
------------------------------------------------------------ */
async function saveIssueToDB(issue, supabase) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) throw new Error("로그인이 필요합니다");

  const res = await fetch(
    "https://bidqauputnhkqepvdzrr.functions.supabase.co/create-issue",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(issue),
    }
  );

  const json = await res.json();

  if (!res.ok) {
    console.error("Edge 오류:", json);
    throw new Error(json.message || "Edge 함수 실패");
  }

  return json; // 새로운 issue ID 포함
}

/* ------------------------------------------------------------
   FORM SUBMIT
------------------------------------------------------------ */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    const supabase = window.supabaseClient;

    const thumbFile = thumbnailInput.files[0];
    const videoFile = videoInput.files[0];

    /* 업로드 */
    const thumbnailId = await uploadImage(thumbFile);
    const videoId = videoFile ? await uploadVideo(videoFile) : null;

    const issue = {
      category: category.value,
      title: titleField.value,
      oneLine: oneLine.value,
      description: description.value,
      thumbnail: thumbnailId,
      video: videoId,
      references: [ref1.value || null, ref2.value || null, ref3.value || null],
    };

    console.log("최종 저장 데이터:", issue);

    const saved = await saveIssueToDB(issue, supabase);

    alert("갈라 생성 완료!");
    location.href = `/issue.html?id=${saved.id}`;
  } catch (err) {
    console.error(err);
    alert("오류 발생: " + err.message);
  }
});