-- =========================================================
-- 갈라리안 v5 — 시즌제 + 상대순위 등급 (롤 + 리니지 하이브리드)
--
-- 사장님: "롤이나 리니지처럼 등급 따기가 어려워야 하는 거 아냐?"
--
-- 맞다. 다만 롤과 리니지는 '어려운 방식'이 다르고, v4 는 둘 다 아니었다.
--   · 롤 챌린저가 어려운 건 '상위 0.01%'라서지 '11년 누적'이라서가 아니다.
--     한 시즌(4개월) 안에 닿을 수 있고, 한 판 이기면 LP 가 즉시 움직인다.
--   · 리니지는 오래 걸리지만 매 레벨 스탯이 오르고 사냥터가 바뀐다.
--   · v4 는 '어려운' 게 아니라 '안 움직이는' 것이었다 —
--     실측: 열심히 하는 유저 기준 판몰이 730일, 대장군 약 11년.
--     6단계라고 해놓고 실질 4단계였다.
--
-- ── 두 트랙으로 나눈다 ───────────────────────────────────
--   ① 평생 레벨(리니지) — 누적, 절대 안 내려간다. '오르는 재미'.
--   ② 시즌 등급(롤)     — 상위 % + 절대 하한. 시즌마다 재출발.
--
-- 상대순위로 가면 대장군은 '더' 어려워진다 — 유저가 10만이어도 100명이다.
-- 동시에 누적 시간이 아니라 '그 시즌에 잘했는가'로 결정되므로
-- 늦게 온 유저도 매 시즌 같은 출발선에 선다(신규 유입이 죽지 않는다).
-- 절대 하한을 같이 두는 이유: 유저가 적을 때 상대 % 만으로는
-- 2등이 대장군이 되는 우스운 일이 생긴다(롤도 마스터+는 LP 컷을 병행한다).
--
-- ── 곁들여 고친 것 ──────────────────────────────────────
-- 받은 반응을 비정규화 카운터(pro_count 등)가 아니라 원본 테이블에서 센다.
-- 카운터에는 created_at 이 없어 시즌 구간을 못 자른다. 원본은 정확하고,
-- 덤으로 라이프타임 값도 카운터 드리프트에서 자유로워진다.
-- =========================================================

-- ---------------------------------------------------------
-- 시즌
-- ---------------------------------------------------------
create table if not exists public.seasons (
  id          serial primary key,
  name        text not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  status      text not null default 'active' check (status in ('upcoming','active','closed')),
  created_at  timestamptz not null default now()
);
create unique index if not exists seasons_one_active
  on public.seasons ((status)) where status = 'active';

insert into public.seasons (name, starts_at, ends_at)
select '시즌 1', date_trunc('day', now()), date_trunc('day', now()) + interval '90 days'
 where not exists (select 1 from public.seasons);

create or replace function public.current_season()
returns public.seasons language sql stable as $$
  select * from public.seasons where status='active' order by starts_at desc limit 1;
$$;

/* 🎁 GI 보너스 — 주간 미션·시즌 보상처럼 '활동 집계로는 안 나오는' 가산점.
   활동 점수와 섞지 않고 따로 쌓아 합산한다(어디서 왔는지 추적 가능). */
create table if not exists public.gi_bonus (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  season_id  int  references public.seasons(id),
  amount     integer not null,
  reason     text not null,
  created_at timestamptz not null default now()
);
create index if not exists gi_bonus_user on public.gi_bonus (user_id, created_at desc);
alter table public.gi_bonus enable row level security;
drop policy if exists gi_bonus_own on public.gi_bonus;
create policy gi_bonus_own on public.gi_bonus for select using (user_id = auth.uid());

-- ---------------------------------------------------------
-- 영역별 원점수 — p_since 부터. null 이면 전체 기간(평생).
--
-- ⚠️ 받은 반응은 원본 테이블에서 센다(카운터는 created_at 이 없어 시즌을 못 자른다).
--    plaza_posts.up_count 만 원본 테이블이 없어 카운터를 쓴다 —
--    시즌 구간에선 '그 시즌에 쓴 글의 up' 으로 근사한다.
-- ---------------------------------------------------------
create or replace function public.gi_domains(p_user uuid, p_since timestamptz default null)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with s as (select coalesce(p_since, '-infinity'::timestamptz) as t)
  select jsonb_build_object(

  /* 🗣 여론 — 이슈 발의와 그 이슈가 실제로 사람을 모았는가 */
  'opinion',
      coalesce((select count(*) * 3 from issues
                 where user_id=p_user and created_at >= (select t from s)), 0)
    + coalesce((select count(*) * 5 from votes v join issues i on i.id=v.issue_id
                 where i.user_id=p_user and v.created_at >= (select t from s)), 0)
    + coalesce((select count(*) * 4 from issue_likes l join issues i on i.id=l.issue_id
                 where i.user_id=p_user and l.created_at >= (select t from s)), 0)
    + coalesce((select count(*) * 2 from votes
                 where user_id=p_user and created_at >= (select t from s)), 0)
    + coalesce((select sum(views_delta) * 0.02 from content_daily_views
                 where user_id=p_user and kind='issue'
                   and day >= (select t from s)::date), 0),

  /* ⚔️ 논전 — 댓글 전투·일기토. 액션량보다 전공과 받은 반응 */
  'debate',
      coalesce((select count(*) * 1 from comments
                 where author_id=p_user and status <> 'deleted'
                   and created_at >= (select t from s)), 0)
    + coalesce((select count(*) * 4 from comment_actions a join comments c on c.id=a.comment_id
                 where c.author_id=p_user and a.created_at >= (select t from s)), 0)
    + coalesce((select count(*) * 8 from comment_likes cl join comments c on c.id=cl.comment_id
                 where c.author_id=p_user and cl.created_at >= (select t from s)), 0)
    + coalesce((select count(*) * 2 from comment_actions
                 where user_id=p_user and created_at >= (select t from s)), 0)
    + coalesce((select count(*) filter (where kind='ko')     * 30
                    + count(*) filter (where kind='assist') * 10
                    + count(*) filter (where kind='guard')  * 12
                 from battle_merits
                where user_id=p_user and created_at >= (select t from s)), 0)
    + coalesce((select count(*) * 2 + count(*) filter (where is_finisher) * 10
                 from duel_messages
                where user_id=p_user and created_at >= (select t from s)), 0)
    + coalesce((select count(*) * 1 from duel_cheers
                 where user_id=p_user and created_at >= (select t from s)), 0),

  /* 🎬 창작 — 갈라리 숏판/롱판·AI 창작·도달 */
  'creation',
      coalesce((select count(*) * 5 from posts
                 where user_id=p_user and is_published and created_at >= (select t from s)), 0)
    + coalesce((select count(*) * 4 from post_likes pl join posts p on p.id=pl.post_id
                 where p.user_id=p_user and pl.created_at >= (select t from s)), 0)
    + coalesce((select count(*) * 6 from post_comments pc join posts p on p.id=pc.post_id
                 where p.user_id=p_user and pc.created_at >= (select t from s)), 0)
    + coalesce((select sum(views_delta) * 0.02 from content_daily_views
                 where user_id=p_user and kind='post'
                   and day >= (select t from s)::date), 0)
    + coalesce((select count(*) * 3 from my_stickers
                 where user_id=p_user and created_at >= (select t from s)), 0)
    + coalesce((select sum(calls) * 2 from ai_user_usage
                 where user_id=p_user and fn ~ 'creat|thumb|video|sticker|image|craft'
                   and day >= (select t from s)::date), 0),

  /* 🔮 예측 — 거래량보다 적중 */
  'predict',
      coalesce((select count(*) * 2 + count(*) filter (where won) * 25 from predict_bets
                 where user_id=p_user and created_at >= (select t from s)), 0)
    + coalesce((select count(*) * 1 from market_comments
                 where user_id=p_user and created_at >= (select t from s)), 0),

  /* 🎪 난장 — 광장·오픈챗·라이브·갈라뉴스 */
  'arena',
      coalesce((select count(*) * 2 + sum(coalesce(up_count,0)) * 3 from plaza_posts
                 where user_id=p_user and created_at >= (select t from s)), 0)
    + coalesce((select sum(views_delta) * 0.02 from content_daily_views
                 where user_id=p_user and kind='plaza'
                   and day >= (select t from s)::date), 0)
    + coalesce((select count(*) * 1 from plaza_comments
                 where author_id=p_user and created_at >= (select t from s)), 0)
    + coalesce((select count(*) filter (where kind='live') * 30
                    + count(*) filter (where kind<>'live') * 10
                    + sum(coalesce(member_count,0)) * 2
                 from open_rooms
                where owner_id=p_user and created_at >= (select t from s)), 0)
    + coalesce((select count(*) * 2 from open_room_members
                 where user_id=p_user and joined_at >= (select t from s)), 0)
    + coalesce((select count(*) * 1 from galla_news_comments
                 where author_id=p_user and created_at >= (select t from s)), 0)
    + coalesce((select count(*) * 1 from galla_news_reactions
                 where user_id=p_user and created_at >= (select t from s)), 0)
  );
$$;

/* GI = 영역별 압축점수 합 + 보너스.
   압축(지수 0.70)은 한 영역 독주를 구조로 막는다 — v2·v3 에서 가중치만
   만졌더니 두 번 재발했다. */
create or replace function public.gi_total(p_user uuid, p_since timestamptz default null)
returns bigint language sql stable security definer set search_path to 'public' as $$
  select (
    coalesce((select sum(public.gi_domain(v.value::numeric))
                from jsonb_each(public.gi_domains(p_user, p_since)) v), 0)
  + coalesce((select sum(amount) from gi_bonus
               where user_id = p_user
                 and created_at >= coalesce(p_since, '-infinity'::timestamptz)), 0)
  )::bigint;
$$;

/* 평생 GI — 배지·칭호 등 기존 호출부가 쓰는 이름. 의미는 그대로(전 기간). */
create or replace function public._user_gi(p_user uuid)
returns bigint language sql stable security definer set search_path to 'public' as $$
  select public.gi_total(p_user, null);
$$;

-- ---------------------------------------------------------
-- 시즌 등급 = 상위 % AND 절대 하한 (둘 다 충족해야 승급)
--
-- 하한은 90일 시즌 기준으로 잡았다(실측 곡선: 열심히 하는 유저 90일 ≈ 11,700 GI).
--   대장군 14,000 = 한 시즌 최상위권이 닿는 선. 거기에 상위 0.1% 컷이 겹친다.
-- ---------------------------------------------------------
create or replace function public.season_tiers()
returns table(tier_lv int, name text, sub text, emoji text, top_pct numeric, floor_gi int)
language sql immutable as $$
  values
    (0::int,  '눈팅러',      '일단 스크롤만 내리는 구경꾼',  '🌱', 100.0::numeric,     0::int),
    (10,      '참견러',      '못 참고 한마디 얹는 사람',     '🔥',  60.0,            200),
    (20,      '판벌이',      '슬슬 판을 벌이기 시작한 사람', '🎪',  30.0,           1200),
    (30,      '판잡이',      '판을 읽고 끌고 가는 사람',     '🎯',  10.0,           4000),
    (40,      '판몰이',      '판 자체를 몰고 가는 사람',     '🌪️',   2.0,           9000),
    (50,      '갈라 대장군', '판을 평정한 전설',             '👑',   0.1,          14000);
$$;

comment on function public.season_tiers() is
  '시즌 등급표 — 상위 %(희소성)와 절대 하한(유저 적을 때 방어)을 둘 다 요구한다. 롤의 마스터+ LP 컷과 같은 이유.';

/* ⚠️ v4 의 gi_domains(uuid) 를 명시적으로 지운다.
   create or replace 는 인자 타입이 다르면 '교체'가 아니라 '오버로드'를 만든다 —
   그대로 두면 gi_domains('...') 호출이 42725(모호함)로 죽는다.
   (이 저장소에서 charge_confirm 때 한 번 당했던 함정) */
drop function if exists public.gi_domains(uuid);
