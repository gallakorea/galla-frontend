-- 💬 난장 채팅바 1:1 동급화 — open_messages.kind에 gif(이모티콘)·voice(음성) 허용
alter table public.open_messages drop constraint if exists open_messages_kind_check;
alter table public.open_messages add constraint open_messages_kind_check
  check (kind = any (array['text','image','system','poll','call','share','gif','voice']));
