-- 🔖 숏판·롱판 저장 — 홈 카드 액션바를 이슈와 동일하게 맞추면서 필요해졌다.
-- 저장할 곳이 없어 버튼을 눌러도 아무 일도 일어나지 않았다.
-- plaza_bookmarks 와 같은 형태(소유자만 읽고 쓰는 개인 보관함). posts.id 가 bigint 라 타입만 다르다.
create table if not exists public.post_bookmarks (
  post_id    bigint not null references public.posts(id) on delete cascade,
  user_id    uuid   not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, post_id)
);

create index if not exists post_bookmarks_user_idx on public.post_bookmarks (user_id, created_at desc);

alter table public.post_bookmarks enable row level security;

-- 보관함은 남이 들여다볼 것이 아니다 — 전부 '내 것만'.
drop policy if exists pb_select_own on public.post_bookmarks;
create policy pb_select_own on public.post_bookmarks for select using (auth.uid() = user_id);
drop policy if exists pb_insert_own on public.post_bookmarks;
create policy pb_insert_own on public.post_bookmarks for insert with check (auth.uid() = user_id);
drop policy if exists pb_delete_own on public.post_bookmarks;
create policy pb_delete_own on public.post_bookmarks for delete using (auth.uid() = user_id);

grant select, insert, delete on public.post_bookmarks to authenticated;
