console.log("[write.js] loaded");

/* -----------------------------------------
   환경 설정
----------------------------------------- */
const CF_ACCOUNT_ID = "8c46fbeae6e69848470dfacaaa8beb03";
const CF_ACCOUNT_HASH = "WRQ-8xhWbU08j8o3OzxpFg";
const CF_TOKEN = "pRDSyrfEv84NYnhN5HmcrhavHET8Eo54oI3kG5W"; // 네가 방금 생성한 Token
const CF_IMAGE_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v1`;
const CF_STREAM_DIRECT_UPLOAD = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/direct_upload`;

/* -----------------------------------------
   Supabase 로딩 대기
----------------------------------------- */
function waitForSupabase() {
    return new Promise(resolve => {
        const t = setInterval(() => {
            if (window.supabaseClient) {
                clearInterval(t);
                resolve(window.supabaseClient);
            }
        }, 20);
    });
}

(async () => {
    const supabase = await waitForSupabase();

    /* -----------------------------------------
       로그인 체크
    ----------------------------------------- */
    const session = await supabase.auth.getSession();
    const user = session.data.session?.user;

    if (!user) {
        alert("발의를 하려면 로그인이 필요합니다.");
        sessionStorage.setItem("returnTo", "write.html");
        location.href = "login.html";
        return;
    }

    /* -----------------------------------------
       FORM ELEMENTS
    ----------------------------------------- */
    const form = document.getElementById("writeForm");
    const category = document.getElementById("category");
    const title = document.getElementById("title");
    const oneLine = document.getElementById("oneLine");
    const description = document.getElementById("description");

    const thumbnailInput = document.getElementById("thumbnail");
    const thumbnailBtn = document.getElementById("thumbnailBtn");
    const videoInput = document.getElementById("videoInput");

    thumbnailBtn.addEventListener("click", () => thumbnailInput.click());

    /* ============================================================
       Cloudflare Images 업로드
       결과: imageId + URL 반환
    ============================================================ */
    async function uploadThumbnailToCloudflare(file) {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(CF_IMAGE_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${CF_TOKEN}`
            },
            body: formData
        });

        const json = await res.json();
        if (!json.success) {
            console.error(json);
            alert("Cloudflare 이미지 업로드 실패");
            return null;
        }

        const imageId = json.result.id;
        return `https://imagedelivery.net/${CF_ACCOUNT_HASH}/${imageId}/public`;
    }

    /* ============================================================
       Cloudflare Stream Direct Upload
       1) Direct Upload URL 발급
       2) 영상 업로드
       3) videoId 반환
    ============================================================ */
    async function uploadVideoToCloudflare(file) {
        console.log("[Stream] Direct Upload URL 요청 중…");

        const initRes = await fetch(CF_STREAM_DIRECT_UPLOAD, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${CF_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ maxDurationSeconds: 120 })
        });

        const initJson = await initRes.json();
        if (!initJson.success) {
            console.error(initJson);
            alert("영상 업로드 URL 생성 실패");
            return null;
        }

        const uploadURL = initJson.result.uploadURL;
        const videoId = initJson.result.uid;

        console.log("[Stream] Upload URL:", uploadURL);
        console.log("[Stream] videoId:", videoId);

        const uploadRes = await fetch(uploadURL, {
            method: "PUT",
            body: file
        });

        if (!uploadRes.ok) {
            alert("Cloudflare Stream 업로드 실패");
            return null;
        }

        // Cloudflare Stream 재생 URL
        return `https://customer-${CF_ACCOUNT_HASH}.cloudflarestream.com/${videoId}/manifest/video.m3u8`;
    }

    /* ============================================================
       FORM SUBMIT
    ============================================================ */
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        /* 필수 검증 */
        if (!category.value.trim()) return alert("카테고리를 선택하세요.");
        if (!title.value.trim()) return alert("제목을 입력하세요.");
        if (!oneLine.value.trim()) return alert("한 줄 코멘트를 입력하세요.");
        if (!description.value.trim()) return alert("이슈 설명을 입력하세요.");
        if (!thumbnailInput.files.length) return alert("썸네일을 업로드해주세요.");

        const ok = confirm("정말 이 갈라를 발의하시겠습니까?");
        if (!ok) return;

        const thumbnailFile = thumbnailInput.files[0];
        const videoFile = videoInput.files[0] ?? null;

        /* -------------------------
           썸네일 업로드
        ------------------------- */
        console.log("썸네일 업로드 시작…");
        const thumbnailURL = await uploadThumbnailToCloudflare(thumbnailFile);

        if (!thumbnailURL) {
            alert("썸네일 업로드 실패");
            return;
        }

        /* -------------------------
           영상 업로드 (선택)
        ------------------------- */
        let videoURL = null;

        if (videoFile) {
            console.log("영상 업로드 시작…");
            videoURL = await uploadVideoToCloudflare(videoFile);
        }

        /* -------------------------
           DB INSERT
        ------------------------- */
        const payload = {
            user_id: user.id,
            category: category.value,
            title: title.value.trim(),
            one_line: oneLine.value.trim(),
            description: description.value.trim(),
            thumbnail_url: thumbnailURL,
            video_url: videoURL,
            status: "normal"
        };

        console.log("[INSERT] issues:", payload);

        const { data, error } = await supabase
            .from("issues")
            .insert(payload)
            .select("id")
            .single();

        if (error) {
            console.error(error);
            alert("DB 저장 실패: " + error.message);
            return;
        }

        alert("발의가 완료되었습니다!");
        location.href = `issue.html?id=${data.id}`;
    });

})();