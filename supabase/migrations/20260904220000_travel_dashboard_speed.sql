-- 여행 대시보드가 3초 제한에 걸려 탭이 백지가 됐다
--
-- 원인: spots CTE 가 공개 장소 **전부**(9,700곳)를 훑으면서 장소마다
--   · (select count(distinct channel) from travel_place_sources where place_id=p.id)
--   · (select max(aired_at) ...)
--   · travel_cover(p.id)
-- 를 각각 돌렸다. 장소가 늘면서 넘어갔다(실측 2026-09-04: 57014 statement timeout, 3.1초).
--
-- 고침: 출처 집계를 **한 번의 group by** 로 끝내고 join 한다.
-- 커버 사진은 최종 20행에만 구한다(9,700번 → 20번).
create or replace function public.travel_dashboard(p_n integer default 8)
returns jsonb language sql stable security definer set search_path to 'public' as $BODY$
  with agg as (
    select place_id, count(distinct channel)::int chn, max(aired_at) last_at
      from travel_place_sources
     group by place_id
  ), spots as (
    select p.id, p.name, p.country, p.country_code,
           coalesce(p.admin1, p.city) area, p.photo,
           coalesce(a.chn, 0) chn, a.last_at
      from travel_places p
      left join agg a on a.place_id = p.id
     where p.status = 'live' and p.scale = 'spot'
  )
  select jsonb_build_object(
    'ok', true,
    'totals', jsonb_build_object(
      'places',    (select count(*) from travel_places where status='live' and scale='spot'),
      'countries', (select count(distinct country_code) from travel_places
                     where status='live' and country_code is not null),
      'creators',  (select count(*) from travel_channels where active and yt_channel_id is not null),
      'videos',    (select count(*) from travel_videos),
      'certs',     (select count(*) from travel_certs)),
    'trend', (select coalesce((travel_trend_top(p_n, 3))->'items', '[]'::jsonb)),
    'trend_period', (select (travel_trend_top(1, 0))->>'period'),
    'multi', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'name', name, 'country', country, 'country_code', country_code,
               'area', area, 'cover', travel_cover(id), 'n', chn) order by chn desc, last_at desc nulls last)
        from (select * from spots where chn >= 2 order by chn desc, last_at desc nulls last
               limit least(coalesce(p_n,8), 20)) a), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'name', name, 'country', country, 'country_code', country_code,
               'area', area, 'cover', travel_cover(id), 'at', last_at) order by last_at desc)
        from (select * from spots where last_at is not null
               order by last_at desc limit least(coalesce(p_n,8), 20)) b), '[]'::jsonb),
    'certs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'name', name, 'country', country, 'country_code', country_code,
               'area', area, 'cover', travel_cover(id), 'emoji', emoji, 'cert', cert, 'n', chn)
               order by rk)
        from (
          /* 인증 장소만 먼저 좁힌 뒤 순위를 매긴다 — 전체를 정렬할 이유가 없다 */
          select s.*, d.emoji, d.name cert,
                 row_number() over (order by (s.chn = 0), (s.photo is null),
                                             (s.name !~ '[가-힣]'), s.chn desc) rk
            from spots s
            join travel_certs tc on tc.place_id = s.id
            join travel_cert_defs d on d.code = tc.code
        ) z
       where rk <= least(coalesce(p_n,8), 20)), '[]'::jsonb),
    'countries', coalesce((
      select jsonb_agg(jsonb_build_object('code', code, 'name', nm, 'n', n, 'chn', chn)
                       order by n desc)
        from (select s.country_code code, min(s.country) nm, count(*)::int n,
                     sum(s.chn)::int chn
                from spots s
               where s.country_code is not null and s.chn > 0
               group by s.country_code order by count(*) desc
               limit least(coalesce(p_n,8), 20)) c), '[]'::jsonb));
$BODY$;

grant execute on function public.travel_dashboard(integer) to anon, authenticated, service_role;

-- 집계를 빠르게 — place_id 로 묶는 질의가 이 함수의 뼈대다
create index if not exists travel_place_sources_place_idx on travel_place_sources(place_id);
