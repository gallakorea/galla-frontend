import { supabase } from "./supabaseClient.js";

const videoInput = document.getElementById("videoUpload");

async function uploadVideo(file) {
  const { data, error } = await supabase.functions.invoke(
    "cf-direct-upload",
    {
      body: { type: "video" }
    }
  );

  if (error) throw error;

  const uploadURL = data?.result?.uploadURL;
  if (!uploadURL) throw new Error("Cloudflare uploadURL missing");

  const res = await fetch(uploadURL, {
    method: "POST",
    body: file
  });

  const uploaded = await res.json();
  if (!uploaded?.success) throw new Error("Cloudflare upload failed");

  return `https://videodelivery.net/${uploaded.result.uid}/manifest/video.m3u8`;
}

async function submitIssue() {
  const title = document.getElementById("title").value;
  const content = document.getElementById("content").value;

  let videoURL = null;
  if (videoInput && videoInput.files.length > 0) {
    videoURL = await uploadVideo(videoInput.files[0]);
  }

  const { error } = await supabase.from("issues").insert({
    title,
    content,
    video_url: videoURL
  });

  if (error) {
    console.error(error);
    alert("저장 실패");
  } else {
    alert("등록 완료");
  }
}

document.getElementById("submitIssue").addEventListener("click", submitIssue);