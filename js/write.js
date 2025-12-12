/* ======================================================================
   WRITE PAGE – FIXED FINAL VERSION (No Illegal Return, Fully Working)
   ====================================================================== */

console.log("write.js loaded");

/* ============================================================
   1) 전역 중복 로딩 방지 (return 사용 X!!)
   ============================================================ */
if (!window.__WRITE_JS_LOADED__) {
    window.__WRITE_JS_LOADED__ = true;
} else {
    console.warn("write.js already executed → skipping");
    // return 사용 금지 → simply exit by not defining events twice
}

/* ============================================================
   2) 필드 DOM
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
   3) Cloudflare ENV 준비 체크
   ============================================================ */
function ensureEnv() {
    if (!window.CF_ACCOUNT_ID) throw new Error("CF_ACCOUNT_ID 없음");
    if (!window.CF_IMAGES_TOKEN) throw new Error("CF_IMAGES_TOKEN 없음");
    if (!window.CF_STREAM_TOKEN) throw new Error("CF_STREAM_TOKEN 없음");
}
ensureEnv();

const CF_ACCOUNT_ID = window.CF_ACCOUNT_ID;
const CF_IMAGES_TOKEN = window.CF_IMAGES_TOKEN;
const CF_STREAM_TOKEN = window.CF_STREAM_TOKEN;

/* ============================================================
   4) 버튼 클릭 이벤트
   ============================================================ */
thumbnailBtn.onclick = () => thumbnailInput.click();
videoBtn.onclick = () => videoInput.click();

/* ============================================================
   Cloudflare Images Direct Upload
   ============================================================ */
async function uploadImage(file) {
    if (!file) return null;

    console.log("Uploading image…");

    const url =
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v1/direct_upload`;

    const res = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${CF_IMAGES_TOKEN}`,
        }
    });

    const json = await res.json();
    if (!json.success) {
        console.error(json);
        throw new Error("Cloudflare Images direct upload 실패");
    }

    const uploadURL = json.result.uploadURL;

    const uploadRes = await fetch(uploadURL, {
        method: "POST",
        body: file
    });

    const imgJson = await uploadRes.json();
    if (!imgJson.result?.id) throw new Error("이미지 업로드 실패");

    return imgJson.result.id;
}

/* ============================================================
   Cloudflare Stream Direct Upload
   ============================================================ */
async function uploadVideo(file) {
    if (!file) return null;

    console.log("Uploading video…");

    const url =
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/direct_upload`;

    const res = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${CF_STREAM_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            maxDurationSeconds: 120,
            requireSignedURLs: false,
        })
    });

    const json = await res.json();
    if (!json.success) {
        console.error(json);
        throw new Error("Cloudflare Stream direct upload 실패");
    }

    const uploadURL = json.result.uploadURL;

    const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        body: file
    });

    if (!uploadRes.ok) throw new Error("영상 업로드 실패");

    return json.result.uid;
}

/* ============================================================
   Supabase Edge Function 저장
   ============================================================ */
async function saveIssueToDB(issue) {
    const supabase = window.supabaseClient;

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("로그인이 필요합니다");

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
    if (!res.ok) {
        console.error(json);
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
        const thumbFile = thumbnailInput.files[0];
        const videoFile = videoInput.files[0];

        const thumbnailId = await uploadImage(thumbFile);
        const videoId = videoFile ? await uploadVideo(videoFile) : null;

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
                ref3.value || null
            ]
        };

        const saved = await saveIssueToDB(issue);

        alert("갈라 생성 완료!");
        location.href = `/issue.html?id=${saved.id}`;

    } catch (err) {
        console.error(err);
        alert("오류 발생: " + err.message);
    }
});