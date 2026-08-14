-- =========================================================
-- 갈라리안 v5 (2/3) — 상대순위 등급 + 등급 캐시
--
-- ⚠️ 시즌 시스템은 이미 있었다(seasons·_current_season·season_leaderboard·
--    season_resolve, 월간). 새로 만들지 않고 여기에 얹는다.
--    기존 시즌 순위는 'GP 획득량' 기준이라 그대로 두고(명예의 전당용),
--    등급은 시즌 GI 기준으로 따로 매긴다 — 지표가 다르면 순위도 달라야 한다.
--
-- ⚠️ S1 이 2026-08-01 에 끝났는데 아무도 마감하지 않아 방치돼 있었다.
--    season_resolve 는 관리자 수동 호출뿐이고 크론이 없었다. 크론을 건다.
-- =========================================================

/* 내가 만든 current_season() 은 _current_season() 과 완전 중복이다 — 지운다.
   같은 걸 두 이름으로 두면 한쪽만 고쳐지는 날이 온다. */
drop function if exists public.current_season();

-- ---------------------------------------------------------
-- 평생 레벨 (리니지 트랙) — 누적, 절대 안 내려간다. 상한 없음.
--
-- 등급 임계값 역할에서 해방됐으므로(등급은 이제 시즌 상대순위) 곡선이 단순해진다.
-- 2차 곡선: 계속 오르되 위로 갈수록 느려진다. 밴드도 특이점도 없다.
--   실측(열심히 하는 유저): 1일 Lv.6 · 30일 Lv.17 · 120일 Lv.26 · 1년 Lv.41 · 2년 Lv.50
--   → 1년차에도 1~2주에 한 번은 레벨이 오른다. '안 움직이는' 구간이 없다.
-- ---------------------------------------------------------
create or replace function public.gi_for_level(p_lv integer)
returns bigint language sql immutable as $$
  select case when p_lv <= 1 then 0
              else round(20 * power(p_lv - 1, 2)) end::bigint;
$$;

create or replace function public.level_of_gi(p_gi bigint)
returns integer language sql immutable as $$
  select greatest(1, floor(sqrt(greatest(p_gi,0)::numeric / 20)) + 1)::int;
$$;

-- ---------------------------------------------------------
-- 시즌 등급표 — 상위 % AND 절대 하한 (둘 다 충족해야 승급)
--
-- 하한은 '월간 시즌'에 맞춰 잡았다(기존 seasons 가 1개월 주기다).
-- 실측: 열심히 하는 유저의 30일 시즌 GI ≈ 5,450.
--   → 대장군 5,500 = 한 달을 꽉 채워 달린 사람이 닿는 선.
--     거기에 상위 0.1% 컷이 겹쳐 '많이 한다고 되는 게' 아니게 만든다.
-- ---------------------------------------------------------
create or replace function public.season_tiers()
returns table(tier_lv int, name text, sub text, emoji text, top_pct numeric, floor_gi int)
language sql immutable as $$
  values
    (0::int,  '눈팅러',      '일단 스크롤만 내리는 구경꾼',  '🌱', 100.0::numeric,    0::int),
    (10,      '참견러',      '못 참고 한마디 얹는 사람',     '🔥',  60.0,           150),
    (20,      '판벌이',      '슬슬 판을 벌이기 시작한 사람', '🎪',  30.0,           600),
    (30,      '판잡이',      '판을 읽고 끌고 가는 사람',     '🎯',  10.0,          1800),
    (40,      '판몰이',      '판 자체를 몰고 가는 사람',     '🌪️',   2.0,          3500),
    (50,      '갈라 대장군', '판을 평정한 전설',             '👑',   0.1,          5500);
$$;

-- ---------------------------------------------------------
-- 등급 캐시
--
-- 왜 필요한가: _user_gi 는 20개 넘는 서브쿼리를 돈다. GP 지급마다(등급 보너스)
-- 부르면 원장 쓰기가 통째로 느려진다. 상대순위는 애초에 '전체 유저를 한 번에'
-- 봐야 나온다. 그래서 주기적으로 한 번 계산해 여기 담는다.
-- ---------------------------------------------------------
create table if not exists public.gallian_cache (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  season_id    bigint,
  gi_life      bigint  not null default 0,
  level        int     not null default 1,
  gi_season    bigint  not null default 0,
  season_rank  int,
  season_pct   numeric,
  tier_lv      int     not null default 0,
  updated_at   timestamptz not null default now()
);
create index if not exists gallian_cache_season on public.gallian_cache (season_id, gi_season desc);
alter table public.gallian_cache enable row level security;
drop policy if exists gallian_cache_read on public.gallian_cache;
create policy gallian_cache_read on public.gallian_cache for select using (true);

create or replace function public.refresh_gallian_cache()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare s seasons; v_n int; v_ranked int;
begin
  s := _current_season();
  if s.id is null then return jsonb_build_object('ok', false, 'reason', 'no_season'); end if;

  with base as (
    select u.id,
           gi_total(u.id, null)          as gi_life,
           gi_total(u.id, s.starts_at)   as gi_season
      from auth.users u
     where u.deleted_at is null
  ),
  /* 순위는 '이번 시즌에 점수가 있는 사람' 안에서만 매긴다.
     가입만 하고 안 온 사람까지 모수에 넣으면 상위 %가 의미를 잃는다
     (롤도 배치 안 돌린 계정은 랭킹 모수가 아니다). */
  ranked as (
    select b.*,
           case when b.gi_season > 0 then rank() over (order by b.gi_season desc) end as rnk,
           count(*) filter (where b.gi_season > 0) over () as denom
      from base b
  )
  insert into gallian_cache (user_id, season_id, gi_life, level, gi_season, season_rank, season_pct, tier_lv, updated_at)
  select r.id, s.id, r.gi_life, level_of_gi(r.gi_life), r.gi_season, r.rnk,
         case when r.rnk is not null and r.denom > 0
              then round(r.rnk::numeric / r.denom * 100, 2) end,
         coalesce((select max(t.tier_lv) from season_tiers() t
                    where r.gi_season >= t.floor_gi
                      and coalesce(round(r.rnk::numeric / nullif(r.denom,0) * 100, 2), 100) <= t.top_pct), 0),
         now()
    from ranked r
  on conflict (user_id) do update set
    season_id=excluded.season_id, gi_life=excluded.gi_life, level=excluded.level,
    gi_season=excluded.gi_season, season_rank=excluded.season_rank,
    season_pct=excluded.season_pct, tier_lv=excluded.tier_lv, updated_at=now();

  get diagnostics v_n = row_count;
  select count(*) into v_ranked from gallian_cache where season_id=s.id and gi_season > 0;
  return jsonb_build_object('ok', true, 'users', v_n, 'ranked', v_ranked, 'season', s.num);
end $$;

/* 내 등급만 즉시 갱신 — 화면에서 '방금 한 활동'이 바로 반영돼야 하는 자리용.
   순위/％는 캐시 값을 유지한다(전체 재계산은 크론이 한다). */
create or replace function public.refresh_my_gallian()
returns void language plpgsql security definer set search_path to 'public' as $$
declare s seasons; u uuid := auth.uid();
begin
  if u is null then return; end if;
  s := _current_season();
  insert into gallian_cache (user_id, season_id, gi_life, level, gi_season, updated_at)
  values (u, s.id, gi_total(u, null), level_of_gi(gi_total(u, null)), gi_total(u, s.starts_at), now())
  on conflict (user_id) do update set
    season_id=excluded.season_id, gi_life=excluded.gi_life,
    level=excluded.level, gi_season=excluded.gi_season, updated_at=now();
end $$;

-- ---------------------------------------------------------
-- 화면용 — 평생 레벨(리니지) + 시즌 등급(롤) + 주특기 + 영역별
-- ---------------------------------------------------------
create or replace function public.gallian_of(p_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
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
      ('opinion','여론형','🗣'), ('debate','논전형','⚔️'), ('creation','창작형','🎬'),
      ('predict','예측형','🔮'), ('arena','난장형','🎪')
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
    'domains', v_pts
  );
end $$;

grant execute on function public.gi_for_level(integer)   to anon, authenticated;
grant execute on function public.level_of_gi(bigint)     to anon, authenticated;
grant execute on function public.season_tiers()          to anon, authenticated;
grant execute on function public.gi_domains(uuid, timestamptz) to authenticated;
grant execute on function public.gi_total(uuid, timestamptz)   to authenticated;
grant execute on function public.gallian_of(uuid)        to authenticated;
grant execute on function public.refresh_my_gallian()    to authenticated;
grant select on public.gallian_cache to anon, authenticated;
