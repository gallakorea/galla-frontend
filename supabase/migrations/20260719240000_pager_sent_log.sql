-- 📟 보낸 호출 이력 — "보냈는데 어디 갔지?" 혼란 해소
-- 감성 원칙 유지: 보낸 '음성'은 다시 듣지 못한다(UI가 재생을 안 줌). 기록만 남는다.
drop policy if exists pager_msgs_sent_read on public.pager_messages;
create policy pager_msgs_sent_read on public.pager_messages for select to authenticated
  using (box_owner = auth.uid() or sender_id = auth.uid());
