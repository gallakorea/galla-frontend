-- 갈라뉴스 반응(좋아요/싫어요) + 저장(북마크). 카드에 지표 표시, 리더에 액션바.
create table if not exists public.galla_news_reactions (
  news_id uuid references public.galla_news(id) on delete cascade,
  user_id uuid not null,
  value smallint not null check (value in (1,-1)),  -- 1=좋아요, -1=싫어요
  created_at timestamptz default now(),
  primary key (news_id, user_id)
);
create table if not exists public.galla_news_bookmarks (
  news_id uuid references public.galla_news(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz default now(),
  primary key (news_id, user_id)
);
alter table public.galla_news_reactions enable row level security;
alter table public.galla_news_bookmarks enable row level security;
create policy gnr_read on public.galla_news_reactions for select using (true);
create policy gnr_ins on public.galla_news_reactions for insert with check (auth.uid()=user_id);
create policy gnr_upd on public.galla_news_reactions for update using (auth.uid()=user_id);
create policy gnr_del on public.galla_news_reactions for delete using (auth.uid()=user_id);
create policy gnb_read on public.galla_news_bookmarks for select using (true);
create policy gnb_ins on public.galla_news_bookmarks for insert with check (auth.uid()=user_id);
create policy gnb_del on public.galla_news_bookmarks for delete using (auth.uid()=user_id);
