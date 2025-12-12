// write.js 최종본

import { supabase } from "./supabaseClient.js";

const videoInput = document.getElementById("videoUpload");
let uploadedVideoURL = null;

// 1) 비디오 업로드 처리
async function uploadVideoToCloudflare(file) {
  console.log("비디오 업로드 시작");

  // 1) Edge Function에서 Direct Upload URL 받기
  const { data: direct, error } = await supabase.functions.invoke(
    "cf-direct-upload",
    {
      body: { type: "video" },
    }
  );

  if (error) {
    console.error("Direct Upload Error:", error);
    throw error;
  }

  const uploadURL = direct?.result?.uploadURL;
  if (!uploadURL) throw new Error("Cloudflare uploadURL 없음");

  console.log("업로드 URL:", uploadURL);

  // 2) Cloudflare로 실제 업로드 (브라우저 → Cloudflare)
  const uploadRes = await fetch(uploadURL, {
    method: "POST",
    body: file,
  });

  const uploaded = await uploadRes.json();

  console.log("Cloudflare 업로드 결과:", uploaded);

  if (!uploaded?.success) {
    throw new Error("Cloudflare 업로드 실패");
  }

  // 3) 실제 영상 URL (playback)
  return `https://videodelivery.net/${uploaded.result.uid}/manifest/video.m3u8`;
}

// 2) 글쓰기 폼 전송
async function submitIssue() {
  const title = document.getElementById("title").value;
  const content = document.getElementById("content").value;

  if (!title || !content) {
    alert("제목과 내용을 입력하세요");
    return;
  }

  let videoURL = null;

  // 영상이 선택된 경우 업로드 실행
  if (videoInput.files.length > 0) {
    videoURL = await uploadVideoToCloudflare(videoInput.files[0]);
  }

  // Supabase DB Insert
  const { data, error } = await supabase.from("issues").insert({
    title,
    content,
    video_url: videoURL, // 영상 URL 저장
  });

  if (error) {
    console.error(error);
    alert("저장 실패");
  } else {
    alert("이슈가 등록되었습니다");
    window.location.href = "/"; // 완료 후 홈 이동
  }
}

document.getElementById("submitIssue").addEventListener("click", submitIssue);