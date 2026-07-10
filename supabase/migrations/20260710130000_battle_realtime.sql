-- 댓글 대전 실시간화
-- 1) 전투 로그(comment_actions)·댓글 HP(comments)를 realtime 발행에 추가
-- 2) 관전자(비로그인)도 전장 속보를 볼 수 있게 comment_actions 공개 읽기
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.comment_actions;

drop policy if exists "Allow authenticated read" on public.comment_actions;
create policy comment_actions_read_all on public.comment_actions for select using (true);
