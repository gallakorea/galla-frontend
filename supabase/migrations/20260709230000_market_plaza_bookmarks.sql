-- 예측(마켓)·광장 글 저장(북마크). 로그인 필수, 본인 것만 (갈라 작성 정책과 일관)
create table if not exists public.market_bookmarks (
  market_id bigint not null references public.markets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (market_id, user_id)
);
alter table public.market_bookmarks enable row level security;
create policy mkb_select_own on public.market_bookmarks for select to authenticated using (auth.uid() = user_id);
create policy mkb_insert_own on public.market_bookmarks for insert to authenticated with check (auth.uid() = user_id);
create policy mkb_delete_own on public.market_bookmarks for delete to authenticated using (auth.uid() = user_id);

create table if not exists public.plaza_bookmarks (
  post_id uuid not null references public.plaza_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);
alter table public.plaza_bookmarks enable row level security;
create policy pzb_select_own on public.plaza_bookmarks for select to authenticated using (auth.uid() = user_id);
create policy pzb_insert_own on public.plaza_bookmarks for insert to authenticated with check (auth.uid() = user_id);
create policy pzb_delete_own on public.plaza_bookmarks for delete to authenticated using (auth.uid() = user_id);
