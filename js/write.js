console.log("[write.js] LOADED");

/* ============================================================
   Supabase 로딩 대기
============================================================ */
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

/* ============================================================
   Cloudflare Images Direct Upload (via Supabase Edge Function)
============================================================ */
async function getImageDirectUploadUrl() {
    const endpoint = "https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/cf-direct-upload";

    const res = await fetch(endpoint, { method: "POST" });
    const json = await res.json();

    console.log("[DirectUpload][Images] Response:", json);

    return json?.result?.uploadURL ?? null;
}

async function uploadThumbnail(file) {
    const uploadURL = await getImageDirectUploadUrl();
    if (!uploadURL) {
        alert("썸네일 업로드 URL 생성 실패");
        return null;
    }

    console.log("[DirectUpload][Images] Upload URL:", uploadURL);

    // Cloudflare Images Direct Upload → 반드시 PUT + raw file
    const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: {
            "Content-Type": file.type
        },
        body: file
    });

    const result = await uploadRes.json();
    console.log("[DirectUpload][Images] Upload result:", result);

    // 실패 처리
    if (!result?.success) {
        console.error(result);
        alert("Cloudflare 이미지 업로드 실패");
        return null;
    }

    // 이미지 ID → public URL 변환
    const imageId = result.result.id;
    return `https://imagedelivery.net/WRQ-8xhWbU08j8o3OzxpFg/${imageId}/public`;
}

/* ============================================================
   Cloudflare Stream Direct Upload (영상 업로드)
============================================================ */
const CF_ACCOUNT_ID = "8c46fbeae6e69848470dfacaaa8beb03";
const CF_STREAM_TOKEN = "pRDSyrfEv84NYnhN5HmcrhavHET8Eo54oI3kG5W"; // 영상용 TOKEN

async function getStreamDirectUploadUrl() {
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
    console.log("[DirectUpload][Stream] Create URL:", json);

    if (!json.success) return null;

    return {
        uploadURL: json.result.uploadURL,
        videoId: json.result.uid
    };
}

async function uploadVideo(file) {
    const data = await getStreamDirectUploadUrl();
    if (!data) {
        alert("영상 업로드 URL 생성 실패");
        return null;
    }

    const { uploadURL, videoId } = data;

    console.log("[DirectUpload][Stream] Upload URL:", uploadURL);

    const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        body: file
    });

    if (!uploadRes.ok) {
        console.error(await uploadRes.text());
        alert("Cloudflare Stream 업로드 실패");
        return null;
    }

    return `https://customer-WRQ-8xhWbU08j8o3OzxpFg.cloudflarestream.com/${videoId}/manifest/video.m3u8`;
}

/* ============================================================
   MAIN
============================================================ */
(async () => {
    const supabase = await waitForSupabase();

    /* 로그인 체크 */
    const session = await supabase.auth.getSession();
    const user = session.data.session?.user;

    if (!user) {
        alert("발의를 하려면 로그인이 필요합니다.");
        sessionStorage.setItem("returnTo", "write.html");
        location.href = "login.html";
        return;
    }

    /* FORM ELEMENTS */
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
       FORM SUBMIT
    ============================================================= */
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (!category.value.trim()) return alert("카테고리를 선택하세요.");
        if (!title.value.trim()) return alert("제목을 입력하세요.");
        if (!oneLine.value.trim()) return alert("한 줄 코멘트를 입력하세요.");
        if (!description.value.trim()) return alert("이슈 설명을 입력하세요.");
        if (!thumbnailInput.files.length) return alert("썸네일을 업로드해주세요.");

        if (!confirm("정말 이 갈라를 발의하시겠습니까?")) return;

        const thumbnailFile = thumbnailInput.files[0];
        const videoFile = videoInput.files[0] ?? null;

        /* -----------------------
           썸네일 업로드
        ----------------------- */
        console.log("썸네일 업로드 시작…");
        const thumbnailURL = await uploadThumbnail(thumbnailFile);
        if (!thumbnailURL) return;

        /* -----------------------
           영상 업로드 (선택)
        ----------------------- */
        let videoURL = null;

        if (videoFile) {
            console.log("영상 업로드 시작…");
            videoURL = await uploadVideo(videoFile);
            if (!videoURL) {
                alert("영상 업로드 실패 (영상 없이 계속 진행합니다)");
                videoURL = null;
            }
        }

        /* -----------------------
           DB INSERT
        ----------------------- */
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

        console.log("[INSERT] issues payload:", payload);

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