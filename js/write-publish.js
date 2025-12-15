import { supabase } from './supabase.js';

export async function publishIssueToDB(payload) {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    alert('로그인이 필요합니다');
    return;
  }

  const {
    category,
    title,
    oneLine,
    description,
    donationTarget,
    isAnonymous,
    thumbnailFile,
    videoFile
  } = payload;

  let thumbnailUrl = null;
  if (thumbnailFile) {
    const path = `issues/${user.id}/${Date.now()}_thumb.jpg`;
    await supabase.storage.from('thumbnails').upload(path, thumbnailFile);
    thumbnailUrl =
      supabase.storage.from('thumbnails').getPublicUrl(path).data.publicUrl;
  }

  let videoUrl = null;
  if (videoFile) {
    const path = `issues/${user.id}/${Date.now()}_speech.mp4`;
    await supabase.storage.from('videos').upload(path, videoFile);
    videoUrl =
      supabase.storage.from('videos').getPublicUrl(path).data.publicUrl;
  }

  const { data, error } = await supabase
    .from('issues')
    .insert({
      category,
      title,
      one_line: oneLine,
      description,
      donation_target: donationTarget,
      is_anonymous: isAnonymous,
      thumbnail_url: thumbnailUrl,
      speech_video_url: videoUrl,
      author_id: user.id
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    alert('발행 실패');
    return;
  }

  window.location.href = `/issue.html?id=${data.id}`;
}