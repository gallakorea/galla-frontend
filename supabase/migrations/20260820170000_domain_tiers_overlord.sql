/* ══ 판별 등급 · 왕중왕 (사장님 피드백 반영분) ══════════════════
   · 등급을 판마다 따로 매긴다 — 이슈에선 판잡이, 예측에선 눈팅러.
   · 판별 등급은 절대 기준(상대% 제거). 판별 모수가 3~5명이라 상위 10%가
     성립하지 않아 31명 중 30명이 눈팅러로 굳어 있었다.
     상대 순위는 왕이 맡는다 — 판마다 한 명, 그 위에 왕중왕 하나.
   · '갈라 대장군'(lv50) 폐지 — 왕 위에 또 왕이 있으면 서열이 무너진다.
   · 판별 레벨(평생) 과 판별 등급(시즌) 을 분리 — 같은 숫자를 두 눈금으로
     두 번 보여주면 '뭐가 뭔지 모르겠다'가 된다. */

CREATE OR REPLACE FUNCTION public.domain_tiers()
 RETURNS TABLE(tier_lv integer, key text, name text, emoji text, sub text, floor_gi integer)
 LANGUAGE sql
 IMMUTABLE
AS $$
  values
    (0,  'spark',    '눈팅러', '🌱', '이 판은 아직 구경만',        0),
    (10, 'breaker',  '참견러', '🔥', '못 참고 한마디 얹기 시작',    30),
    (20, 'vanguard', '판벌이', '🎪', '이 판에서 판을 벌인다',      100),
    (30, 'authority','판잡이', '🎯', '이 판을 읽고 끌고 간다',     300),
    (40, 'dominion', '판몰이', '🌪️', '왕 사정권. 한 끗 남았다',    700)
$$
;

CREATE OR REPLACE FUNCTION public.domain_tier_lv(p_gi numeric)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $$
  select coalesce((select max(t.tier_lv) from domain_tiers() t
                    where coalesce(p_gi,0) >= t.floor_gi), 0);
$$
;

CREATE OR REPLACE FUNCTION public.king_floor()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $$ select 60 $$
;

CREATE OR REPLACE FUNCTION public.overlord_floor()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $$ select 300 $$
;

CREATE OR REPLACE FUNCTION public.refresh_gallian_cache()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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
                       where user_id = b.id and created_at >= s.starts_at), 0))::bigint as gi_season,
           /* 혜택 기준 = 내가 가장 잘하는 판의 등급.
              판별 등급은 절대 기준이라 상대% 때문에 전원 눈팅러가 되던 문제가 없다. */
           coalesce((select max(domain_tier_lv(e.v::numeric))
                       from jsonb_each_text(b.gi_dom) e(k,v)), 0) as top_dom_tier
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
         r.top_dom_tier, r.gi_dom, now()
    from ranked r
  on conflict (user_id) do update set
    season_id=excluded.season_id, gi_life=excluded.gi_life, level=excluded.level,
    gi_season=excluded.gi_season, season_rank=excluded.season_rank,
    season_pct=excluded.season_pct, tier_lv=excluded.tier_lv,
    gi_dom=excluded.gi_dom, updated_at=now();
  get diagnostics v_n = row_count;

  /* 판 다섯의 왕 */
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

  /* 왕중왕 — 통합 1위 */
  insert into season_kings (season_id, domain, user_id, gi, crowned_at)
  select s.id, 'all', c.user_id, c.gi_season, now()
    from gallian_cache c
   where c.season_id = s.id and c.gi_season >= overlord_floor()
   order by c.gi_season desc, c.user_id limit 1
  on conflict (season_id, domain) do update
     set user_id = excluded.user_id, gi = excluded.gi,
         crowned_at = case when season_kings.user_id is distinct from excluded.user_id
                           then now() else season_kings.crowned_at end;

  select count(*) into v_ranked from gallian_cache where season_id=s.id and gi_season > 0;
  return jsonb_build_object('ok', true, 'users', v_n, 'ranked', v_ranked, 'season', s.num);
end $$
;

CREATE OR REPLACE FUNCTION public.kings_now()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  with s as (select * from _current_season()),
       d(domain, name, emoji, ord) as (values
         ('issue','이슈왕','⚔️',1), ('arena','광장왕','🎪',2),
         ('short','숏판왕','📱',3), ('long','롱판왕','🎞',4),
         ('predict','예측왕','🔮',5))
  select jsonb_build_object(
    'ok', true,
    'season', (select num from s),
    'floor', king_floor(),
    'overlord_floor', overlord_floor(),
    /* 왕중왕 — 판 다섯 위의 한 자리 */
    'overlord', (select jsonb_build_object(
                   'user_id', k.user_id, 'nickname', up.nickname,
                   'gi', k.gi, 'since', k.crowned_at)
                   from season_kings k
                   left join user_profiles up on up.user_id = k.user_id
                  where k.season_id = (select id from s) and k.domain = 'all'),
    'contenders', (select count(*) from gallian_cache
                    where season_id = (select id from s) and gi_season > 0),
    'kings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'domain', d.domain, 'name', d.name, 'emoji', d.emoji,
               'user_id', k.user_id, 'nickname', up.nickname,
               'gi', coalesce(k.gi, 0), 'since', k.crowned_at
             ) order by d.ord)
        from d
        left join season_kings k on k.domain = d.domain and k.season_id = (select id from s)
        left join user_profiles up on up.user_id = k.user_id
    ), '[]'::jsonb)
  );
$$
;

CREATE OR REPLACE FUNCTION public.gallian_of(p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare u uuid := coalesce(p_user, auth.uid());
        s seasons; c gallian_cache;
        v_dom jsonb; v_pts jsonb; v_pts_life jsonb; v_gi_s bigint; v_life bigint; v_lv int;
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
  /* 판별 레벨은 '평생', 판별 등급은 '이번 시즌'을 본다.
     둘 다 시즌 점수로 매기면 같은 숫자를 두 눈금으로 두 번 보여주는 꼴이 된다. */
  select jsonb_object_agg(k, gi_domain(v::numeric)) into v_pts_life
    from jsonb_each_text(gi_domains(u, null)) d(k,v);
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
    'domains_life', v_pts_life,
    /* 내가 지금 쓰고 있는 왕관 */
    'my_kings', coalesce((select jsonb_agg(k.domain order by k.domain)
                            from season_kings k
                           where k.season_id = s.id and k.user_id = u), '[]'::jsonb)
  );
end $$
;


do $chk$
declare v jsonb;
begin
  if (select count(*) from domain_tiers()) <> 5 then raise exception '판별 등급이 5칸이 아니다'; end if;
  if domain_tier_lv(0) <> 0 or domain_tier_lv(30) <> 10 or domain_tier_lv(299) <> 20
     or domain_tier_lv(300) <> 30 or domain_tier_lv(700) <> 40 then
    raise exception '판별 등급 경계 불일치';
  end if;
  perform refresh_gallian_cache();
  select kings_now() into v;
  if jsonb_array_length(v->'kings') <> 5 then raise exception '왕좌가 다섯이 아니다'; end if;
  if not (v ? 'overlord') then raise exception '왕중왕 자리가 없다'; end if;
  select gallian_of((select user_id from gallian_cache order by gi_life desc limit 1)) into v;
  if not (v ? 'domains_life') then raise exception '평생 판별 점수가 안 내려온다'; end if;
  raise notice '판별 등급·왕중왕 OK';
end $chk$;
