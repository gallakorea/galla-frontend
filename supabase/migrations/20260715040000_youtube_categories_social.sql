-- =========================================================
-- 핫영상 고도화 — 카테고리별 피드 + 영상 소셜(좋아요/댓글)
--   * youtube_hot 만 변경. 갈라뉴스 등 다른 카테고리 체계는 건드리지 않는다.
-- =========================================================

-- ── 1) 카테고리별 피드 ───────────────────────────────────
-- 같은 영상이 '전체'와 자기 카테고리에 동시에 뜰 수 있으므로
-- PK를 (feed, video_id)로 바꾸고 순위도 피드 안에서 매긴다.
alter table public.youtube_hot add column if not exists feed text not null default 'all';

alter table public.youtube_hot drop constraint if exists youtube_hot_pkey;
delete from public.youtube_hot a using public.youtube_hot b
  where a.ctid < b.ctid and a.feed = b.feed and a.video_id = b.video_id;
alter table public.youtube_hot add primary key (feed, video_id);

create index if not exists youtube_hot_feed_rank_idx on public.youtube_hot (feed, rank);

-- ── 2) 영상 좋아요 ───────────────────────────────────────
create table if not exists public.video_likes (
  video_id   text not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (video_id, user_id)
);
alter table public.video_likes enable row level security;

drop policy if exists video_likes_read on public.video_likes;
create policy video_likes_read on public.video_likes for select using (true);

-- 작성 정책: 로그인 필수(정보통신망법 대비 — user_id 기록)
drop policy if exists video_likes_own on public.video_likes;
create policy video_likes_own on public.video_likes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 3) 영상 댓글 ─────────────────────────────────────────
create table if not exists public.video_comments (
  id         bigserial primary key,
  video_id   text not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.video_comments enable row level security;

create index if not exists video_comments_video_idx
  on public.video_comments (video_id, created_at desc);

drop policy if exists video_comments_read on public.video_comments;
create policy video_comments_read on public.video_comments for select using (true);

drop policy if exists video_comments_insert on public.video_comments;
create policy video_comments_insert on public.video_comments for insert
  with check (auth.uid() = user_id);

-- 본인 댓글 삭제 + 관리자 오버라이드(다른 콘텐츠와 동일 원칙)
drop policy if exists video_comments_delete on public.video_comments;
create policy video_comments_delete on public.video_comments for delete
  using (auth.uid() = user_id or public._is_admin());

-- ── 4) 카드에 붙일 집계 (한 번에 가져오기) ────────────────
create or replace function public.video_social(p_ids text[])
returns table (video_id text, likes bigint, comments bigint, liked boolean)
language sql stable security definer set search_path = public as $$
  select v.id as video_id,
         (select count(*) from video_likes l where l.video_id = v.id),
         (select count(*) from video_comments c where c.video_id = v.id),
         exists (select 1 from video_likes l
                  where l.video_id = v.id and l.user_id = auth.uid())
  from unnest(p_ids) as v(id)
$$;
grant execute on function public.video_social(text[]) to anon, authenticated;

-- 댓글 목록 (작성자 닉네임·아바타 조인 — user_profiles는 PII 잠금이라 users 사용)
create or replace function public.video_comment_list(p_video_id text)
returns table (
  id bigint, body text, created_at timestamptz,
  user_id uuid, nickname text, avatar_url text, mine boolean
)
language sql stable security definer set search_path = public as $$
  select c.id, c.body, c.created_at, c.user_id,
         coalesce(u.nickname, '갈라이안'), u.avatar_url,
         c.user_id = auth.uid()
  from video_comments c
  left join users u on u.id = c.user_id
  where c.video_id = p_video_id
  order by c.created_at desc
  limit 200
$$;
grant execute on function public.video_comment_list(text) to anon, authenticated;
