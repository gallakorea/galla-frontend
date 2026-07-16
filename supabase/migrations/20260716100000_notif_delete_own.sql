-- 알림 스와이프 삭제: 본인 알림만 삭제 허용
drop policy if exists notif_delete_own on public.notifications;
create policy notif_delete_own on public.notifications
  for delete using (user_id = auth.uid());
