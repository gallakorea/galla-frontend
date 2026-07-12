-- 이슈 좋아요 (액션바 하트)
create table if not exists public.issue_likes (
  issue_id   bigint not null references public.issues(id) on delete cascade,
  user_id    uuid   not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (issue_id, user_id)
);
alter table public.issue_likes enable row level security;
drop policy if exists issue_likes_read on public.issue_likes;
create policy issue_likes_read on public.issue_likes for select to public using (true);
drop policy if exists issue_likes_write on public.issue_likes;
create policy issue_likes_write on public.issue_likes for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
