-- =========================================================
-- 핫영상 2차 — 쇼츠/롱폼 분리 + 대댓글 + 댓글 좋아요
-- =========================================================

-- ── 1) 쇼츠 구분 ─────────────────────────────────────────
alter table public.youtube_hot add column if not exists duration_sec int not null default 0;
alter table public.youtube_hot add column if not exists is_short boolean not null default false;
create index if not exists youtube_hot_feed_short_rank_idx
  on public.youtube_hot (feed, is_short, rank);

-- ── 2) 대댓글 ────────────────────────────────────────────
alter table public.video_comments
  add column if not exists parent_id bigint references public.video_comments(id) on delete cascade;
create index if not exists video_comments_parent_idx on public.video_comments (parent_id);

-- ── 3) 댓글 좋아요 ───────────────────────────────────────
create table if not exists public.video_comment_likes (
  comment_id bigint not null references public.video_comments(id) on delete cascade,
  user_id    uuid   not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table public.video_comment_likes enable row level security;

drop policy if exists vcl_read on public.video_comment_likes;
create policy vcl_read on public.video_comment_likes for select using (true);

drop policy if exists vcl_own on public.video_comment_likes;
create policy vcl_own on public.video_comment_likes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 4) 댓글 목록 (부모/자식 + 좋아요 집계) ────────────────
-- 반환 컬럼이 늘어나므로 CREATE OR REPLACE로는 못 바꾼다.
drop function if exists public.video_comment_list(text);
create function public.video_comment_list(p_video_id text)
returns table (
  id bigint, parent_id bigint, body text, created_at timestamptz,
  user_id uuid, nickname text, avatar_url text, mine boolean,
  likes bigint, liked boolean
)
language sql stable security definer set search_path = public as $$
  select c.id, c.parent_id, c.body, c.created_at, c.user_id,
         coalesce(u.nickname, '갈라이안'), u.avatar_url,
         c.user_id = auth.uid(),
         (select count(*) from video_comment_likes l where l.comment_id = c.id),
         exists (select 1 from video_comment_likes l
                  where l.comment_id = c.id and l.user_id = auth.uid())
  from video_comments c
  left join users u on u.id = c.user_id
  where c.video_id = p_video_id
  -- 최상위는 최신순, 답글은 오래된 순(대화 흐름)으로 묶어 내려준다
  order by coalesce(c.parent_id, c.id) desc, c.parent_id nulls first, c.created_at asc
  limit 300
$$;
grant execute on function public.video_comment_list(text) to anon, authenticated;
