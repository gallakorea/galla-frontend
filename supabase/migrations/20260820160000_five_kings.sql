/* ══════════════════════════════════════════════════════════════
   갈라엔 왕이 다섯이다. 아무도 다섯을 다 갖지 못한다.

   1) 레벨 곡선 ÷20 → ÷5 (촘촘하게, 올라가는 맛)
   2) 영역을 다섯으로 다시 자른다 — 이슈·광장·숏판·롱판·예측
      (기존 여론+논전 → 이슈 / 창작 → 숏판+롱판 분리)
   3) 왕 다섯 — 시즌마다 영역별 1위
   4) galla_rank.level 이 전원 1로 굳어 있던 것 수리
   ══════════════════════════════════════════════════════════════ */

/* ── 1. 레벨 곡선 ÷5 ─────────────────────────────────────────── */
create or replace function public.level_of_gi(p_gi bigint)
returns integer language sql immutable as $$
  select greatest(1, floor(sqrt(greatest(p_gi,0)::numeric / 5)) + 1)::int;
$$;

create or replace function public.gi_for_level(p_lv integer)
returns bigint language sql immutable as $$
  select case when p_lv <= 1 then 0 else round(5 * power(p_lv - 1, 2)) end::bigint;
$$;

/* ── 2. 영역 다섯 ────────────────────────────────────────────── */
create or replace function public.gi_domains(
  p_user uuid, p_since timestamptz default null)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with s as (select coalesce(p_since, '-infinity'::timestamptz) as t)
  select jsonb_build_object(

  /* ⚔️ 이슈 — 발의해서 사람을 모으고, 댓글판에서 싸운다.
     (예전 '여론'과 '논전'은 결국 같은 화면이라 하나로 합쳤다) */
  'issue',
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
                   and day >= (select t from s)::date), 0)
    + coalesce((select count(*) * 1 from comments
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

  /* 📱 숏판 — 세로. AI 창작(썸네일·짧은 영상·스티커)도 여기로 친다 */
  'short',
      coalesce((select count(*) * 5 from posts
                 where user_id=p_user and is_published and kind='vertical'
                   and created_at >= (select t from s)), 0)
    + coalesce((select count(*) * 4 from post_likes pl join posts p on p.id=pl.post_id
                 where p.user_id=p_user and p.kind='vertical'
                   and pl.created_at >= (select t from s)), 0)
    + coalesce((select count(*) * 6 from post_comments pc join posts p on p.id=pc.post_id
                 where p.user_id=p_user and p.kind='vertical'
                   and pc.created_at >= (select t from s)), 0)
    + coalesce((select sum(cdv.views_delta) * 0.02
                  from content_daily_views cdv join posts p on p.id::text = cdv.content_id::text
                 where cdv.user_id=p_user and cdv.kind='post' and p.kind='vertical'
                   and cdv.day >= (select t from s)::date), 0)
    + coalesce((select count(*) * 3 from my_stickers
                 where user_id=p_user and created_at >= (select t from s)), 0)
    + coalesce((select sum(calls) * 2 from ai_user_usage
                 where user_id=p_user and fn ~ 'creat|thumb|video|sticker|image|craft'
                   and day >= (select t from s)::date), 0),

  /* 🎞 롱판 — 가로. 오래 붙잡아 두는 쪽 */
  'long',
      coalesce((select count(*) * 5 from posts
                 where user_id=p_user and is_published and kind='horizontal'
                   and created_at >= (select t from s)), 0)
    + coalesce((select count(*) * 4 from post_likes pl join posts p on p.id=pl.post_id
                 where p.user_id=p_user and p.kind='horizontal'
                   and pl.created_at >= (select t from s)), 0)
    + coalesce((select count(*) * 6 from post_comments pc join posts p on p.id=pc.post_id
                 where p.user_id=p_user and p.kind='horizontal'
                   and pc.created_at >= (select t from s)), 0)
    + coalesce((select sum(cdv.views_delta) * 0.02
                  from content_daily_views cdv join posts p on p.id::text = cdv.content_id::text
                 where cdv.user_id=p_user and cdv.kind='post' and p.kind='horizontal'
                   and cdv.day >= (select t from s)::date), 0),

  /* 🔮 예측 — 거래량보다 적중 */
  'predict',
      coalesce((select count(*) * 2 + count(*) filter (where won) * 25 from predict_bets
                 where user_id=p_user and created_at >= (select t from s)), 0)
    + coalesce((select count(*) * 1 from market_comments
                 where user_id=p_user and created_at >= (select t from s)), 0),

  /* 🎪 광장 — 광장·난장·라이브·갈라뉴스 */
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

/* ── 3. 캐시에 영역별 점수를 같이 저장 ────────────────────────── */
alter table public.gallian_cache add column if not exists gi_dom jsonb;
grant select (user_id, season_id, gi_life, level, gi_season, season_rank, season_pct, tier_lv, gi_dom, updated_at)
  on public.gallian_cache to authenticated, anon;

/* 왕좌 — 시즌 × 영역마다 한 자리.
   매 갱신마다 현재 1위를 덮어쓴다. 시즌이 끝나면 마지막에 덮인 사람이
   그대로 그 시즌의 왕으로 남는다(따로 마감 훅이 필요 없다). */
create table if not exists public.season_kings (
  season_id  int  not null,
  domain     text not null,
  user_id    uuid,
  gi         bigint not null default 0,
  crowned_at timestamptz not null default now(),
  primary key (season_id, domain)
);
alter table public.season_kings enable row level security;
drop policy if exists season_kings_read on public.season_kings;
create policy season_kings_read on public.season_kings for select using (true);
grant select on public.season_kings to authenticated, anon;

/* 왕이 되려면 최소한은 해야 한다. 한 판 하고 왕 되는 건 왕이 아니다. */
create or replace function public.king_floor() returns int
language sql immutable as $$ select 60 $$;

create or replace function public.refresh_gallian_cache()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare s seasons; v_n int; v_ranked int;
begin
  s := _current_season();
  if s.id is null then return jsonb_build_object('ok', false, 'reason', 'no_season'); end if;

  with base as (
    select u.id,
           gi_total(u.id, null)          as gi_life,
           gi_total(u.id, s.starts_at)   as gi_season,
           (select jsonb_object_agg(k, gi_domain(v::numeric))
              from jsonb_each_text(gi_domains(u.id, s.starts_at)) d(k,v)) as gi_dom
      from auth.users u
     where u.deleted_at is null
  ),
  /* 순위는 '이번 시즌에 점수가 있는 사람' 안에서만 매긴다. */
  ranked as (
    select b.*,
           case when b.gi_season > 0 then rank() over (order by b.gi_season desc) end as rnk,
           count(*) filter (where b.gi_season > 0) over () as denom
      from base b
  )
  insert into gallian_cache (user_id, season_id, gi_life, level, gi_season, season_rank, season_pct, tier_lv, gi_dom, updated_at)
  select r.id, s.id, r.gi_life, level_of_gi(r.gi_life), r.gi_season, r.rnk,
         case when r.rnk is not null and r.denom > 0
              then round(r.rnk::numeric / r.denom * 100, 2) end,
         coalesce((select max(t.tier_lv) from season_tiers() t
                    where r.gi_season >= t.floor_gi
                      and coalesce(round(r.rnk::numeric / nullif(r.denom,0) * 100, 2), 100) <= t.top_pct), 0),
         r.gi_dom, now()
    from ranked r
  on conflict (user_id) do update set
    season_id=excluded.season_id, gi_life=excluded.gi_life, level=excluded.level,
    gi_season=excluded.gi_season, season_rank=excluded.season_rank,
    season_pct=excluded.season_pct, tier_lv=excluded.tier_lv,
    gi_dom=excluded.gi_dom, updated_at=now();

  get diagnostics v_n = row_count;

  /* 왕 다섯 — 영역마다 이번 시즌 1위 */
  insert into season_kings (season_id, domain, user_id, gi, crowned_at)
  select s.id, d.domain, d.user_id, d.gi, now()
    from (
      select k as domain, user_id, (v::numeric)::bigint as gi,
             row_number() over (partition by k order by v::numeric desc, user_id) as rn
        from gallian_cache c, jsonb_each_text(coalesce(c.gi_dom,'{}'::jsonb)) e(k,v)
       where c.season_id = s.id and (v::numeric) >= king_floor()
    ) d
   where d.rn = 1
  on conflict (season_id, domain) do update
     set user_id = excluded.user_id, gi = excluded.gi,
         crowned_at = case when season_kings.user_id is distinct from excluded.user_id
                           then now() else season_kings.crowned_at end;

  select count(*) into v_ranked from gallian_cache where season_id=s.id and gi_season > 0;
  return jsonb_build_object('ok', true, 'users', v_n, 'ranked', v_ranked, 'season', s.num);
end $$;

/* ── 4. 왕 다섯 조회 ─────────────────────────────────────────── */
create or replace function public.kings_now()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with s as (select * from _current_season()),
       d(domain, name, emoji, ord) as (values
         ('issue','이슈왕','⚔️',1), ('arena','광장왕','🎪',2),
         ('short','숏판왕','📱',3), ('long','롱판왕','🎞',4),
         ('predict','예측왕','🔮',5))
  select jsonb_build_object(
    'ok', true,
    'season', (select num from s),
    'floor', king_floor(),
    'kings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'domain', d.domain, 'name', d.name, 'emoji', d.emoji,
               'user_id', k.user_id,
               'nickname', up.nickname,
               'gi', coalesce(k.gi, 0),
               'since', k.crowned_at
             ) order by d.ord)
        from d
        left join season_kings k
               on k.domain = d.domain and k.season_id = (select id from s)
        left join user_profiles up on up.user_id = k.user_id
    ), '[]'::jsonb)
  );
$$;
grant execute on function public.kings_now() to authenticated, anon;

/* ── 5. 주특기 이름을 다섯에 맞추고, 쓴 왕관을 같이 내려보낸다 ── */
CREATE OR REPLACE FUNCTION public.gallian_of(p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare u uuid := coalesce(p_user, auth.uid());
        s seasons; c gallian_cache;
        v_dom jsonb; v_pts jsonb; v_gi_s bigint; v_life bigint; v_lv int;
        t record; nt record;
        v_top text; v_top_pct numeric; v_spec text; v_spec_emoji text;
begin
  if u is null then return jsonb_build_object('ok', false, 'reason', 'auth'); end if;
  s := _current_season();
  select * into c from gallian_cache where user_id = u;

  /* 점수는 실시간으로 다시 센다(방금 한 활동이 바로 보여야 한다).
     캐시에서 가져오는 건 순위·％뿐이다 — 그건 남들이 있어야 나오는 값이라
     혼자서는 못 구한다. */
  v_dom  := gi_domains(u, s.starts_at);
  select jsonb_object_agg(k, gi_domain(v::numeric)) into v_pts from jsonb_each_text(v_dom) d(k,v);
  v_gi_s := gi_total(u, s.starts_at);
  v_life := gi_total(u, null);
  v_lv   := level_of_gi(v_life);

  select * into t from season_tiers() x where x.tier_lv = coalesce(c.tier_lv, 0);
  select * into nt from season_tiers() x where x.tier_lv > coalesce(c.tier_lv, 0) order by x.tier_lv limit 1;

  /* 🎨 주특기 — 무엇으로 여기까지 왔나. 한 영역이 40% 이상이면 그 색. */
  select key, case when v_gi_s > 0 then round(value::numeric / v_gi_s * 100) else 0 end
    into v_top, v_top_pct from jsonb_each_text(v_pts) order by value::numeric desc limit 1;
  if v_gi_s = 0 or coalesce(v_top_pct,0) < 40 then
    v_spec := '만능형'; v_spec_emoji := '🎲';
  else
    select z.name, z.emoji into v_spec, v_spec_emoji from (values
      ('issue','이슈형','⚔️'), ('arena','광장형','🎪'), ('short','숏판형','📱'),
      ('long','롱판형','🎞'), ('predict','예측형','🔮')
    ) z(k, name, emoji) where z.k = v_top;
  end if;

  return jsonb_build_object(
    'ok', true,
    /* 리니지 트랙 — 평생, 절대 안 내려간다 */
    'gi_life', v_life, 'level', v_lv,
    'level_gi_from', gi_for_level(v_lv), 'level_gi_to', gi_for_level(v_lv + 1),
    'to_next_level', greatest(0, gi_for_level(v_lv + 1) - v_life),
    'level_progress', case when gi_for_level(v_lv+1) > gi_for_level(v_lv)
      then least(100, round((v_life - gi_for_level(v_lv))::numeric
                          / (gi_for_level(v_lv+1) - gi_for_level(v_lv)) * 100)) else 0 end,
    /* 롤 트랙 — 시즌 상대순위 */
    'season', jsonb_build_object('num', s.num, 'name', s.name,
                                 'starts_at', s.starts_at, 'ends_at', s.ends_at,
                                 'days_left', greatest(0, (s.ends_at::date - current_date))),
    'gi_season', v_gi_s, 'rank', c.season_rank, 'pct', c.season_pct,
    'tier', jsonb_build_object('lv', coalesce(t.tier_lv,0), 'name', t.name, 'sub', t.sub, 'emoji', t.emoji),
    'next_tier', case when nt.tier_lv is not null then jsonb_build_object(
        'lv', nt.tier_lv, 'name', nt.name, 'emoji', nt.emoji,
        'top_pct', nt.top_pct, 'floor_gi', nt.floor_gi,
        'gi_short', greatest(0, nt.floor_gi - v_gi_s),
        /* 하한은 넘었는데 순위가 모자란 경우를 구분해 알려준다 —
           "얼마 더 하면 되는지"와 "남들보다 잘해야 하는지"는 다른 얘기다. */
        'needs_rank', (v_gi_s >= nt.floor_gi and coalesce(c.season_pct, 100) > nt.top_pct)
      ) end,
    'specialty', jsonb_build_object('key', case when coalesce(v_top_pct,0) < 40 then 'all' else v_top end,
                                    'name', v_spec, 'emoji', v_spec_emoji, 'pct', coalesce(v_top_pct,0)),
    'domains', v_pts,
    /* 내가 지금 쓰고 있는 왕관 */
    'my_kings', coalesce((select jsonb_agg(k.domain order by k.domain)
                            from season_kings k
                           where k.season_id = s.id and k.user_id = u), '[]'::jsonb)
  );
end $$
;

/* ── 6. galla_rank.level 수리 ────────────────────────────────
   user_profiles.level 은 아무도 갱신하지 않아 전원 1로 굳어 있었다.
   진짜 레벨은 GI에서 나온다 — 20분마다 갱신되는 캐시를 본다. */
create or replace view public.galla_rank as
  select b.user_id,
         up.nickname,
         coalesce(gc.level, 1) as level,
         round(b.balance::numeric, 0) as points,
         10000 + coalesce(le.earned, 0::bigint) as lifetime,
         rank() over (order by (10000 + coalesce(le.earned, 0::bigint)) desc) as rank
    from point_balances b
    left join user_profiles up on up.user_id = b.user_id
    left join gallian_cache gc on gc.user_id = b.user_id
    left join (select user_id, sum(delta) filter (where delta > 0::double precision)::bigint as earned
                 from point_ledger group by user_id) le on le.user_id = b.user_id;

/* ── 자체 점검 ──────────────────────────────────────────────── */
do $chk$
declare v jsonb; n int;
begin
  if level_of_gi(0) <> 1 or level_of_gi(5) <> 2 or level_of_gi(80) <> 5
     or level_of_gi(405) <> 10 or level_of_gi(1805) <> 20 then
    raise exception '레벨 곡선 ÷5 불일치: 5=%, 80=%, 405=%, 1805=%',
      level_of_gi(5), level_of_gi(80), level_of_gi(405), level_of_gi(1805);
  end if;
  if gi_for_level(10) <> 405 or gi_for_level(1) <> 0 then
    raise exception 'gi_for_level 역함수 불일치: %', gi_for_level(10);
  end if;

  select gi_domains((select id from auth.users where deleted_at is null limit 1), null) into v;
  if not (v ? 'issue' and v ? 'arena' and v ? 'short' and v ? 'long' and v ? 'predict') then
    raise exception '영역 다섯이 아니다: %', v;
  end if;
  select count(*) into n from jsonb_object_keys(v);
  if n <> 5 then raise exception '영역 개수 %: %', n, v; end if;

  perform refresh_gallian_cache();
  if (select count(*) from gallian_cache where gi_dom is null) > 0 then
    raise exception 'gi_dom 미채움 %건', (select count(*) from gallian_cache where gi_dom is null);
  end if;

  select kings_now() into v;
  if jsonb_array_length(v->'kings') <> 5 then
    raise exception '왕좌가 다섯이 아니다: %', v;
  end if;

  raise notice '왕 다섯 OK — %', v->'kings';
end $chk$;

/* ── 7. 갱신 비용 절감 ── */
/* gi_season 은 gi_dom 의 합 + 보너스와 같다(gi_total 의 정의 그대로).
   따로 gi_total 을 또 부르면 시즌 영역 계산을 두 번 한다 — 유저당 1회 아낀다. */
create or replace function public.refresh_gallian_cache()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare s seasons; v_n int; v_ranked int;
begin
  s := _current_season();
  if s.id is null then return jsonb_build_object('ok', false, 'reason', 'no_season'); end if;

  with base as (
    select u.id,
           gi_total(u.id, null) as gi_life,
           (select jsonb_object_agg(k, gi_domain(v::numeric))
              from jsonb_each_text(gi_domains(u.id, s.starts_at)) d(k,v)) as gi_dom
      from auth.users u
     where u.deleted_at is null
  ),
  scored as (
    select b.*,
           (coalesce((select sum(v::numeric) from jsonb_each_text(b.gi_dom) e(k,v)), 0)
          + coalesce((select sum(amount) from gi_bonus
                       where user_id = b.id and created_at >= s.starts_at), 0))::bigint as gi_season
      from base b
  ),
  ranked as (
    select x.*,
           case when x.gi_season > 0 then rank() over (order by x.gi_season desc) end as rnk,
           count(*) filter (where x.gi_season > 0) over () as denom
      from scored x
  )
  insert into gallian_cache (user_id, season_id, gi_life, level, gi_season, season_rank, season_pct, tier_lv, gi_dom, updated_at)
  select r.id, s.id, r.gi_life, level_of_gi(r.gi_life), r.gi_season, r.rnk,
         case when r.rnk is not null and r.denom > 0
              then round(r.rnk::numeric / r.denom * 100, 2) end,
         coalesce((select max(t.tier_lv) from season_tiers() t
                    where r.gi_season >= t.floor_gi
                      and coalesce(round(r.rnk::numeric / nullif(r.denom,0) * 100, 2), 100) <= t.top_pct), 0),
         r.gi_dom, now()
    from ranked r
  on conflict (user_id) do update set
    season_id=excluded.season_id, gi_life=excluded.gi_life, level=excluded.level,
    gi_season=excluded.gi_season, season_rank=excluded.season_rank,
    season_pct=excluded.season_pct, tier_lv=excluded.tier_lv,
    gi_dom=excluded.gi_dom, updated_at=now();

  get diagnostics v_n = row_count;

  insert into season_kings (season_id, domain, user_id, gi, crowned_at)
  select s.id, d.domain, d.user_id, d.gi, now()
    from (
      select k as domain, user_id, (v::numeric)::bigint as gi,
             row_number() over (partition by k order by v::numeric desc, user_id) as rn
        from gallian_cache c, jsonb_each_text(coalesce(c.gi_dom,'{}'::jsonb)) e(k,v)
       where c.season_id = s.id and (v::numeric) >= king_floor()
    ) d
   where d.rn = 1
  on conflict (season_id, domain) do update
     set user_id = excluded.user_id, gi = excluded.gi,
         crowned_at = case when season_kings.user_id is distinct from excluded.user_id
                           then now() else season_kings.crowned_at end;

  select count(*) into v_ranked from gallian_cache where season_id=s.id and gi_season > 0;
  return jsonb_build_object('ok', true, 'users', v_n, 'ranked', v_ranked, 'season', s.num);
end $$;

do $chk$
declare v jsonb;
begin
  v := refresh_gallian_cache();
  if not (v->>'ok')::boolean then raise exception '갱신 실패: %', v; end if;
  if (select count(*) from gallian_cache where gi_dom is null) > 0 then
    raise exception 'gi_dom 미채움';
  end if;
end $chk$;
