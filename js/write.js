// ==========================
// Supabase Client
// ==========================
import { supabase } from "./supabase.js";

const form = document.getElementById("writeForm");

// HTML 요소 연결
const category = document.getElementById("category");
const titleInput = document.getElementById("title");
const oneLine = document.getElementById("oneLine");
const description = document.getElementById("description");
const ref1 = document.getElementById("ref1");
const ref2 = document.getElementById("ref2");
const ref3 = document.getElementById("ref3");

const thumbnailInput = document.getElementById("thumbnail");
const videoInput = document.getElementById("videoInput");

const thumbnailBtn = document.getElementById("thumbnailBtn");
const openVideoEditor = document.getElementById("openVideoEditor");
const openAiModal = document.getElementById("openAiModal");

// ==========================
// 파일 선택 버튼
// ==========================
thumbnailBtn.addEventListener("click", () => thumbnailInput.click());
openVideoEditor.addEventListener("click", () => videoInput.click());

// ==========================
// Cloudflare Direct Upload
// ==========================
async function cfUpload(file, type) {
  const { data, error } = await supabase.functions.invoke(
    "cf-direct-upload",
    { body: { type } }
  );

  if (error) throw new Error("CF Upload URL 요청 실패");

  const uploadURL = data?.result?.uploadURL;
  if (!uploadURL) throw new Error("uploadURL 없음");

  const res = await fetch(uploadURL, {
    method: "POST",
    body: file,
  });

  const json = await res.json();
  if (!json?.success) throw new Error("Cloudflare 업로드 실패");

  if (type === "thumbnail") {
    return json.result.variants[0]; // image URL
  } else {
    return `https://videodelivery.net/${json.result.uid}/manifest/video.m3u8`;
  }
}

// ==========================
// AI 글 다듬기
// ==========================
openAiModal.addEventListener("click", async () => {
  if (!description.value.trim()) {
    alert("내용을 입력하세요");
    return;
  }

  openAiModal.disabled = true;
  openAiModal.innerText = "AI 생성 중...";

  const { data, error } = await supabase.functions.invoke("issue-ai", {
    body: { content: description.value }
  });

  description.value = data.result;

  openAiModal.innerText = "✨ AI에게 글 다듬기";
  openAiModal.disabled = false;
});

// ==========================
// 최종 등록 submit
// ==========================
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    const cat = category.value;
    const ttl = titleInput.value.trim();
    const oneline = oneLine.value.trim();
    const desc = description.value.trim();

    if (!cat || !ttl || !oneline || !desc) {
      alert("필수 항목을 입력하세요.");
      return;
    }

    // 업로드
    let thumbnailURL = null;
    let videoURL = null;

    if (thumbnailInput.files.length > 0) {
      thumbnailURL = await cfUpload(thumbnailInput.files[0], "thumbnail");
    }

    if (videoInput.files.length > 0) {
      videoURL = await cfUpload(videoInput.files[0], "video");
    }

    // DB 저장
    const { error } = await supabase.from("issues").insert({
      category: cat,
      title: ttl,
      one_line: oneline,
      description: desc,
      thumbnail_url: thumbnailURL,
      video_url: videoURL,
      ref1: ref1.value.trim(),
      ref2: ref2.value.trim(),
      ref3: ref3.value.trim(),
    });

    if (error) throw error;

    alert("발의가 완료되었습니다!");
    location.href = "index.html";

  } catch (err) {
    console.error(err);
    alert("등록 중 오류 발생");
  }
});