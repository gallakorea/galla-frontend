-- 2026-10-11 보안 감사: 컬럼 grant(expire_secs / title,topic)를 줬지만 기본 테이블 UPDATE 권한이 남아 무력했다(라이브 확인).
-- dm_threads: 참여자가 user_lo/user_hi 를 바꿔 남과의 과거 DM 을 제3자에게 노출하거나, last_message 로 가짜 미리보기를 띄울 수 있었다.
-- open_rooms: 방장이 kind(그룹→공개)·member_count·is_live 를 마음대로 바꿀 수 있었다.
-- 클라 직접 쓰기는 dm_threads.expire_secs, open_rooms.title/topic 수정과 open_rooms 삭제(방장)뿐 — 나머지는 SECURITY DEFINER RPC.
revoke insert, update, delete on public.dm_threads from anon, authenticated;
grant update (expire_secs) on public.dm_threads to authenticated;
revoke insert, update on public.open_rooms from anon, authenticated;
revoke delete on public.open_rooms from anon;
grant update (title, topic) on public.open_rooms to authenticated;
