-- 👻 유령 모드 확산 — 모든 댓글 게시판(뉴스·예측·핫유튜브)에 적용
alter table public.galla_news_comments
  add column if not exists is_anonymous boolean not null default false,
  add column if not exists ghost_seed text;
alter table public.market_comments
  add column if not exists is_anonymous boolean not null default false,
  add column if not exists ghost_seed text;
alter table public.video_comments
  add column if not exists is_anonymous boolean not null default false,
  add column if not exists ghost_seed text;

drop trigger if exists trg_enforce_ghost_news on public.galla_news_comments;
create trigger trg_enforce_ghost_news before insert on public.galla_news_comments
  for each row execute function public._enforce_ghost();
drop trigger if exists trg_enforce_ghost_market on public.market_comments;
create trigger trg_enforce_ghost_market before insert on public.market_comments
  for each row execute function public._enforce_ghost();
drop trigger if exists trg_enforce_ghost_video on public.video_comments;
create trigger trg_enforce_ghost_video before insert on public.video_comments
  for each row execute function public._enforce_ghost();

-- 핫유튜브 댓글 RPC: 유령이면 닉/아바타 마스킹 + seed 반환 (반환형 변경이라 drop 후 재생성)
drop function if exists public.video_comment_list(text);
create function public.video_comment_list(p_video_id text)
returns table(id bigint, parent_id bigint, body text, created_at timestamptz, user_id uuid,
              nickname text, avatar_url text, mine boolean, likes bigint, liked boolean,
              is_anonymous boolean, ghost_seed text)
language sql stable security definer set search_path to public as $$
  select c.id, c.parent_id, c.body, c.created_at,
         case when c.is_anonymous then null else c.user_id end,          -- 유령은 uid도 미노출
         case when c.is_anonymous then null else coalesce(u.nickname,'갈라이안') end,
         case when c.is_anonymous then null else u.avatar_url end,
         c.user_id = auth.uid(),
         (select count(*) from video_comment_likes l where l.comment_id = c.id),
         exists (select 1 from video_comment_likes l
                  where l.comment_id = c.id and l.user_id = auth.uid()),
         c.is_anonymous, c.ghost_seed
  from video_comments c
  left join users u on u.id = c.user_id
  where c.video_id = p_video_id
  order by coalesce(c.parent_id, c.id) desc, c.parent_id nulls first, c.created_at asc
  limit 300
$$;
grant execute on function public.video_comment_list(text) to anon, authenticated;

-- 유령 댓글은 anon_name이 null(렌더가 ghost_seed 페르소나로 대체) — NOT NULL 해제
alter table public.plaza_comments alter column anon_name drop not null;
