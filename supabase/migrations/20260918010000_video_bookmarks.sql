-- 핫튜브 영상 저장 — 홈 피드 카드의 아이콘 줄을 이슈와 같게 맞추면서 '저장'의 자리가 필요해졌다.
-- 좋아요(video_likes)와 같은 모양: video_id(유튜브 id 문자열) + user_id, 본인 것만 읽고 쓴다.
create table if not exists public.video_bookmarks (
  video_id   text        not null,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (video_id, user_id)
);
alter table public.video_bookmarks enable row level security;
drop policy if exists vb_sel on public.video_bookmarks;
drop policy if exists vb_ins on public.video_bookmarks;
drop policy if exists vb_del on public.video_bookmarks;
create policy vb_sel on public.video_bookmarks for select using (auth.uid() = user_id);
create policy vb_ins on public.video_bookmarks for insert with check (auth.uid() = user_id);
create policy vb_del on public.video_bookmarks for delete using (auth.uid() = user_id);
grant select, insert, delete on public.video_bookmarks to authenticated;
