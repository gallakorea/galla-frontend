-- 여행지 검색 트렌드 (2026-09-01)
-- 사장님: "최근 다녀간 곳은 의미 없을 듯. 지금 가장 인기 있고 검색량 많은 여행지를 보여주자."
--
-- 🔍 구글 트렌드는 **공식 공개 API 가 없다**. 우리가 이미 쓰는 건 오늘의 급상승 RSS 라
--    여행지가 거의 안 잡힌다(연예·스포츠가 대부분). 대신 **네이버 데이터랩 검색어트렌드**를 쓴다:
--      · 공식 API, 무료, 우리 기존 키로 바로 200 OK(신청 불필요 — 실측)
--      · 한국인의 여행 검색은 네이버 쪽이 더 정확하다
-- ⚠️ 데이터랩은 **절대 검색량이 아니라 요청 안에서의 상대값(0~100)** 이다.
--    요청이 다르면 값을 그대로 비교할 수 없다 → 매 요청에 **앵커 키워드**를 끼워 정규화한다.
--    앵커가 없으면 배치마다 1위가 100이 되어 전부 100인 표가 나온다.
-- ⚠️ 그룹은 요청당 최대 5개다. 앵커 1개를 빼면 실제로는 4개씩 돈다.
create table if not exists public.travel_trends (
  scope        text not null,             -- 'country'
  code         text not null,             -- 'JP'
  keyword      text not null,             -- '일본여행'
  period       date not null,             -- 월 단위
  ratio        numeric not null,          -- 앵커로 정규화한 값
  raw          numeric,                   -- 원본 상대값(진단용)
  updated_at   timestamptz not null default now(),
  primary key (scope, code, period)
);
create index if not exists travel_trends_recent on public.travel_trends (period desc, ratio desc);
alter table public.travel_trends enable row level security;
drop policy if exists travel_trends_read on public.travel_trends;
create policy travel_trends_read on public.travel_trends for select to anon, authenticated using (true);
grant select, insert, update, delete on public.travel_trends to service_role;

create or replace function public.travel_trends_save(p_items jsonb)
returns int language plpgsql security definer set search_path = public as $fn$
declare it jsonb; n int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    insert into travel_trends(scope, code, keyword, period, ratio, raw, updated_at)
    values (coalesce(it->>'scope','country'), upper(it->>'code'), it->>'keyword',
            (it->>'period')::date, (it->>'ratio')::numeric, nullif(it->>'raw','')::numeric, now())
    on conflict (scope, code, period) do update
      set ratio = excluded.ratio, raw = excluded.raw,
          keyword = excluded.keyword, updated_at = now();
    n := n + 1;
  end loop;
  return n;
end $fn$;
revoke all on function public.travel_trends_save(jsonb) from anon, authenticated;

/* 지금 검색 뜨는 여행지 — 최신 달 값과 직전 달 대비 증감.
   ⚠️ '급등률'만 쓰면 검색량이 원래 적은 나라가 1위가 된다(3 → 6 이면 +100%).
      그래서 최신 값이 일정 수준 이상인 것만 올리고, 화면엔 값과 증감을 같이 보여준다. */
create or replace function public.travel_trend_top(p_n int default 12, p_min numeric default 5)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with last2 as (
    select t.*, row_number() over (partition by t.code order by t.period desc) rn
      from travel_trends t where t.scope = 'country'
  ),
  cur as (select * from last2 where rn = 1),
  prev as (select * from last2 where rn = 2)
  select jsonb_build_object('ok', true, 'period', (select max(period) from cur),
    'items', coalesce(jsonb_agg(x order by ratio desc), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'code', c.code, 'keyword', c.keyword, 'ratio', round(c.ratio, 1),
      'delta', case when p.ratio is null or p.ratio = 0 then null
                    else round((c.ratio - p.ratio) / p.ratio * 100) end,
      'name', (select min(country) from travel_places
                where country_code = c.code and country is not null),
      'places', (select count(*) from travel_places
                  where country_code = c.code and status='live' and scale='spot'),
      'cover', (select a.photo from travel_area_photos a
                 where a.scope='country' and a.code = c.code)) x,
      c.ratio
    from cur c left join prev p on p.code = c.code
    where c.ratio >= coalesce(p_min, 5)
    order by c.ratio desc
    limit least(coalesce(p_n, 12), 40)
  ) q;
$fn$;
grant execute on function public.travel_trend_top(int,numeric) to anon, authenticated;
