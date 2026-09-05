-- food_regions 가 183ms 다. 블록은 1,730개로 적은데 시간이 길다 — CPU 계산이 원인이다.
--   cnt CTE 가 37,905곳 전체를 group by 한 뒤, 시도 17개마다 그 결과를 다시 조인하고
--   시군구마다 또 조인한다. 맛집 탭에 들어올 때마다 이걸 돈다.
--
-- 지역별 가게 수는 자주 안 바뀐다(수집 크론이 돌 때만). 표로 만들어 둔다.
create table if not exists food_region_counts (
  region text primary key,
  n      integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table food_region_counts enable row level security;
create policy food_region_counts_read on food_region_counts for select using (true);

create or replace function public.food_region_counts_refresh()
returns integer language sql security definer set search_path to 'public' as $$
  with c as (
    select region, count(*) n from food_places
     where status='live' and region is not null group by region),
  up as (
    insert into food_region_counts(region, n, updated_at)
    select region, n, now() from c
    on conflict (region) do update set n = excluded.n, updated_at = now()
    returning 1),
  del as (
    delete from food_region_counts x
     where not exists (select 1 from c where c.region = x.region) returning 1)
  select (select count(*) from up)::int;
$$;
revoke all on function public.food_region_counts_refresh() from public, anon, authenticated;
select food_region_counts_refresh();

create or replace function public.food_regions()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('ok', true, 'sido', coalesce(jsonb_agg(x order by ord), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'code', s.code, 'name', s.name,
      /* 미리 세어 둔 표를 읽는다 — 매번 37,905곳을 group by 하지 않는다 */
      'n', coalesce((select sum(c.n) from food_region_counts c
                       join weather_regions r on r.code = c.region
                      where r.code = s.code or r.parent = s.code), 0),
      'cities', coalesce((select jsonb_agg(jsonb_build_object(
            'code', ct.code, 'name', ct.name, 'n', coalesce(cc.n, 0))
            order by coalesce(cc.n,0) desc, ct.sort)
          from weather_regions ct left join food_region_counts cc on cc.region = ct.code
         where ct.parent = s.code and ct.kind = 'city'), '[]'::jsonb)) x,
      s.sort ord
    from weather_regions s
    where s.kind = 'sido'
  ) q;
$$;
grant execute on function public.food_regions() to anon, authenticated;
