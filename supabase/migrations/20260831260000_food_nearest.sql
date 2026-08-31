-- 내 주변 — 좌표로 가장 가까운 동네 (2026-08-31)
-- 역지오코딩을 부르지 않는다. weather_regions 에 227곳 좌표가 이미 있고,
-- '동네' 단위 해상도면 최근접 계산으로 충분하다. API 호출도 아끼고 오프라인에도 강하다.
create or replace function public.food_nearest_region(p_lat numeric, p_lon numeric)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', code is not null, 'code', code, 'name', name,
                            'km', round(dist::numeric, 1))
    from (
      select r.code, r.name,
             -- 하버사인. 국내 범위라 이 정도 근사면 동네 판별에 충분하다.
             6371 * 2 * asin(sqrt(
               power(sin(radians(r.lat - p_lat) / 2), 2) +
               cos(radians(p_lat)) * cos(radians(r.lat)) *
               power(sin(radians(r.lon - p_lon) / 2), 2))) dist
        from weather_regions r
       where r.kind = 'city'
       order by dist
       limit 1
    ) t;
$fn$;
grant execute on function public.food_nearest_region(numeric,numeric) to anon, authenticated;
-- 서울시청 좌표로 검증
select food_nearest_region(37.5665, 126.9780);
