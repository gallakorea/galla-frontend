/* ======================================================================
   WRITE PAGE – FINAL STABLE VERSION
   Cloudflare Images + Cloudflare Stream + Supabase Edge Functions
   ====================================================================== */

console.log("write.js loaded");

// 중복 실행 방지
if (window.__WRITE_JS_LOADED__) {
  console.warn("write.js already loaded → skipping duplicate execution");
  return;
}
window.__WRITE_JS_LOADED__ = true;

/* ============================================================
   1) 필드 DOM
   ============================================================ */
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

/* ============================================================
   2) 환경 변수 (Cloudflare)
   → Supabase Edge Secrets에서 로드됨
   ============================================================ */

const CF_ACCOUNT_ID = window.CF_ACCOUNT_ID;
const CF_IMAGES_TOKEN = window.CF_IMAGES_TOKEN;
const CF_STREAM_TOKEN = window.CF_STREAM_TOKEN;

/* ============================================================
   3) 썸네일 업로드 버튼
   ============================================================ */
thumbnailBtn.addEventListener("click", () => thumbnailInput.click());

/* ============================================================
   4) 영상 업로드 버튼
   ============================================================ */
videoBtn.addEventListener("click", () => videoInput.click());

/* ============================================================
   Cloudflare Images Direct Upload
   ============================================================ */
async function uploadImage(file) {
  if (!file) return null;

  console.log("Uploading image…");

  // 1) Direct upload URL 받아오기
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v1/direct_upload`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_IMAGES_TOKEN}`,
    },
  });

  const json = await res.json();
  if (!json.success) {
    console.error("CF Images direct upload URL error:", json);
    throw new Error("Cloudflare Images direct upload 실패");
  }

  const uploadURL = json.result.uploadURL;

  // 2) 파일 업로드
  const imgRes = await fetch(uploadURL, {
    method: "POST",
    body: file,
  });

  const imgJson = await imgRes.json();
  console.log("CF image upload response:", imgJson);

  if (!imgJson.result?.id) throw new Error("이미지 업로드 실패");

  return imgJson.result.id;
}

/* ============================================================
   Cloudflare Stream Direct Upload
   ============================================================ */
async function uploadVideo(file) {
  if (!file) return null;

  console.log("Uploading video…");

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/direct_upload`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_STREAM_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      maxDurationSeconds: 120,
      requireSignedURLs: false,
    }),
  });

  const json = await res.json();
  if (!json.success) {
    console.error("CF Stream direct upload URL error:", json);
    throw new Error("Cloudflare Stream direct upload 실패");
  }

  const uploadURL = json.result.uploadURL;

  // 실제 파일 업로드
  const videoRes = await fetch(uploadURL, {
    method: "PUT",
    body: file,
  });

  if (!videoRes.ok) throw new Error("영상 업로드 실패");

  return json.result.uid;
}

/* ============================================================
   Supabase Edge Function 호출
   ============================================================ */
async function saveIssueToDB(issue, supabase) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) throw new Error("로그인이 필요합니다");

  const res = await fetch(
    "https://YOUR-SUPABASE-PROJECT.functions.supabase.co/create-issue",
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
    console.error("Edge error:", json);
    throw new Error(json.message || "Edge 함수 오류");
  }

  return json;
}

/* ============================================================
   FORM SUBMIT
   ============================================================ */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    const supabase = window.supabaseClient;

    const thumbFile = thumbnailInput.files[0];
    const videoFile = videoInput.files[0];

    /* ---------------------
       1) Cloudflare Upload
       --------------------- */
    const thumbnailId = await uploadImage(thumbFile);
    const videoId = videoFile ? await uploadVideo(videoFile) : null;

    /* ---------------------
       2) Supabase 저장
       --------------------- */
    const issue = {
      category: category.value,
      title: title.value,
      oneLine: oneLine.value,
      description: description.value,
      thumbnail: thumbnailId,
      video: videoId,
      references: [
        ref1.value || null,
        ref2.value || null,
        ref3.value || null,
      ],
    };

    console.log("Saving issue:", issue);

    const saved = await saveIssueToDB(issue, supabase);

    alert("갈라 생성 완료!");
    location.href = `/issue.html?id=${saved.id}`;
  } catch (err) {
    console.error(err);
    alert("오류 발생: " + err.message);
  }
});