-- 🎤🎬 미리보기: 음성 메시지 + 스티커/GIF 구분 (적용됨 — 기록용)
create or replace function public.dm_touch_thread()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_preview text;
begin
  v_preview := case new.kind
    when 'image' then '📷 사진'
    when 'gif'   then '🎬 ' || case when new.meta->>'sticker' = 'true' then '이모티콘' else 'GIF' end
    when 'voice' then '🎤 음성 메시지'
    when 'share' then '🔗 ' || coalesce(new.meta->>'title', '콘텐츠 공유')
    when 'e2e'   then '🔒 비밀 메시지'
    when 'call'  then '📞 ' || case when new.meta->>'video' = 'true' then '면상톡' else '육성톡' end
    else new.body end;
  update dm_threads
     set last_message = left(v_preview, 120), last_sender = new.sender_id, last_message_at = new.created_at
   where id = new.thread_id;
  return new;
end $$;
