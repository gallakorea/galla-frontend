-- 신고 / 차단 (⋯ 메뉴 실동작)

-- 콘텐츠 신고
create table if not exists public.content_reports (
  id           bigint generated always as identity primary key,
  reporter_id  uuid not null references auth.users(id) on delete cascade,
  content_type text not null,          -- issue | plaza | market | comment | user
  content_id   text not null,
  reason       text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_content_reports_target on public.content_reports(content_type, content_id);
alter table public.content_reports enable row level security;

drop policy if exists content_reports_insert_self on public.content_reports;
create policy content_reports_insert_self on public.content_reports
  for insert to authenticated with check (auth.uid() = reporter_id);
-- 열람은 관리자만
drop policy if exists content_reports_admin_read on public.content_reports;
create policy content_reports_admin_read on public.content_reports
  for select to authenticated using (public.is_admin());

-- 사용자 차단
create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
alter table public.user_blocks enable row level security;

drop policy if exists user_blocks_all_self on public.user_blocks;
create policy user_blocks_all_self on public.user_blocks
  for all to authenticated
  using (auth.uid() = blocker_id)
  with check (auth.uid() = blocker_id);
