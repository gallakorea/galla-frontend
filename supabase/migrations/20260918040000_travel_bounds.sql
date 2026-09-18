-- 여행 지도: 나라(·광역)를 고르고 지도를 열면 그 나라가 보이게 — 장소 좌표 범위를 준다(26.9.18 사장님 「일본 선택하고 지도 눌렀는데 한국이 나오네」)
-- ⚠️ min/max 가 아니라 2~98 백분위. 좌표를 잘못 찍은 한두 곳(바다 건너 튄 점) 때문에 나라 전체가 개미만 해지지 않게.
--    섬나라처럼 넓게 퍼진 곳(일본 오키나와 등)은 백분위 안에 들어오면 같이 보인다.
create or replace function public.travel_bounds(p_country text, p_area text default null)
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  with pts as (
    select lat, lon from travel_places
     where status = 'live' and lat is not null and scale <> 'country'
       and country_code = upper(p_country)
       and (p_area is null or p_area = '*' or admin1 = p_area)
  )
  select case when count(*) = 0 then jsonb_build_object('ok', false)
    else jsonb_build_object('ok', true, 'n', count(*),
      'south', percentile_cont(0.02) within group (order by lat),
      'north', percentile_cont(0.98) within group (order by lat),
      'west',  percentile_cont(0.02) within group (order by lon),
      'east',  percentile_cont(0.98) within group (order by lon)) end
  from pts;
$$;
grant execute on function public.travel_bounds(text, text) to anon, authenticated;
