-- 갈라뉴스 배틀 댓글: 대댓글(parent_id) + @멘션(프론트 하이라이트) + 좋아요.
-- market_comments 패턴 재사용. 관리 API로 이미 적용, 기록용.
create table if not exists public.galla_news_comments (
  id bigserial primary key,
  news_id uuid references public.galla_news(id) on delete cascade,
  user_id uuid not null,
  content text not null,
  parent_id bigint references public.galla_news_comments(id) on delete cascade,
  created_at timestamptz default now()
);
create table if not exists public.galla_news_comment_likes (
  comment_id bigint references public.galla_news_comments(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz default now(),
  primary key (comment_id, user_id)
);
create index if not exists idx_gnc_news on public.galla_news_comments(news_id, created_at);
alter table public.galla_news_comments enable row level security;
alter table public.galla_news_comment_likes enable row level security;
create policy gnc_read on public.galla_news_comments for select using (true);
create policy gnc_insert on public.galla_news_comments for insert with check (auth.uid() = user_id);
create policy gnc_delete on public.galla_news_comments for delete using (auth.uid() = user_id);
create policy gncl_read on public.galla_news_comment_likes for select using (true);
create policy gncl_ins on public.galla_news_comment_likes for insert with check (auth.uid() = user_id);
create policy gncl_del on public.galla_news_comment_likes for delete using (auth.uid() = user_id);
