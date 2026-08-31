-- 2단 지역 목록 (2026-08-31)
-- 캐치테이블식으로 시도를 고르면 하위 권역이 펼쳐지게 한다(사장님 제안).
-- 검색만 있으면 이름을 알아야 쓸 수 있다 — 훑어보는 사람은 못 고른다.
-- weather_regions 가 이미 시도 17 + 시군구 227 의 2단 구조라 그대로 쓴다.
-- 맛집이 있는 동네를 앞세워 보여준다 — 0곳인 동네만 잔뜩 보이면 고를 맛이 안 난다.
create or replace function public.food_regions()
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with cnt as (
    select region, count(*) n from food_places
     where status='live' and region is not null group by region
  )
  select jsonb_build_object('ok', true, 'sido', coalesce(jsonb_agg(x order by ord), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'code', s.code, 'name', s.name,
      'n', coalesce((select sum(c.n) from cnt c
                       join weather_regions r on r.code = c.region
                      where r.code = s.code or r.parent = s.code), 0),
      'cities', coalesce((select jsonb_agg(jsonb_build_object(
            'code', ct.code, 'name', ct.name, 'n', coalesce(cc.n, 0))
            order by coalesce(cc.n,0) desc, ct.sort)
          from weather_regions ct left join cnt cc on cc.region = ct.code
         where ct.parent = s.code and ct.kind = 'city'), '[]'::jsonb)) x,
      s.sort ord
    from weather_regions s
    where s.kind = 'sido'
  ) q;
$fn$;
grant execute on function public.food_regions() to anon, authenticated;
select jsonb_array_length(food_regions()->'sido') as sido;
