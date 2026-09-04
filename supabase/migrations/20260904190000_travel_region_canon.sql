-- 지역명이 갈라져 같은 곳이 여러 칸으로 잡히던 것을 하나로 모은다
--
-- 실측(2026-09-04): 공개 장소 9,756곳에 지역 키가 1,177개였다. 국내만 봐도
--   서울(672) ↔ 서울특별시(21)     경기(232) ↔ 경기도(108)
--   강원(167) ↔ 강원특별자치도(202)  경북(521) ↔ 경상북도(120)
-- 처럼 같은 광역이 둘로 쪼개져 있었다. 크리에이터 페이지의 '지역별 묶음'이
-- 같은 도를 두 줄로 보여주던 이유다.
--
-- ⚠️ 접두사 일치로 합치면 안 된다. '작센' ↔ '작센안할트', '파라' ↔ '파라나' 는
--    서로 다른 주다. 그래서 국내는 **표로 명시**하고, 해외는 접미사(주/도/州/省/県/府)를
--    떼었을 때 **정확히 같은 값이 실제로 존재할 때만** 합친다.

create table if not exists travel_region_alias (
  country_code text not null,
  raw          text not null,
  canon        text not null,
  primary key (country_code, raw)
);
grant select on travel_region_alias to anon, authenticated;

-- ── 국내 17개 시도로 모은다(화면에 읽히는 짧은 이름을 정본으로) ──
insert into travel_region_alias(country_code, raw, canon) values
  ('KR','서울특별시','서울'), ('KR','부산광역시','부산'), ('KR','대구광역시','대구'),
  ('KR','인천광역시','인천'), ('KR','광주광역시','광주'), ('KR','대전광역시','대전'),
  ('KR','울산광역시','울산'), ('KR','세종특별자치시','세종'),
  ('KR','경기도','경기'), ('KR','강원도','강원'), ('KR','강원특별자치도','강원'),
  ('KR','충청북도','충북'), ('KR','충청남도','충남'),
  ('KR','전라북도','전북'), ('KR','전북특별자치도','전북'),
  ('KR','전라남도','전남'), ('KR','경상북도','경북'), ('KR','경상남도','경남'),
  ('KR','제주도','제주'), ('KR','제주특별자치도','제주'),
  -- 원본 데이터가 전남을 '전남광주'로 적어 보낸다(무안·신안·장성·광양·담양·화순이 전부 여기 있다)
  ('KR','전남광주','전남'), ('KR','전남광주통합특별시','전남'),
  -- 시군구가 광역 자리에 들어온 것들
  ('KR','울주군','울산'), ('KR','기장군','부산'), ('KR','군위군','대구'),
  ('KR','옹진군','인천'), ('KR','강화군','인천')
on conflict (country_code, raw) do update set canon = excluded.canon;

-- ── 해외: 접미사만 다른 쌍을 **양쪽이 실제로 있을 때만** 합친다 ──
-- 정본은 장소 수가 많은 쪽. 적은 쪽을 많은 쪽으로 보낸다.
with a as (
  select country_code cc, admin1, count(*)::int n
    from travel_places
   where status = 'live' and country_code <> 'KR' and coalesce(admin1,'') <> ''
   group by 1, 2
), base as (
  select cc, admin1, n,
         btrim(regexp_replace(admin1, '[[:space:]]*(주|도|州|省|県|府)$', '')) b
    from a
), pair as (
  select x.cc, x.admin1 raw, y.admin1 canon
    from base x join base y
      on x.cc = y.cc and x.b = y.b and x.admin1 <> y.admin1
     and (y.n > x.n or (y.n = x.n and length(y.admin1) < length(x.admin1)))
)
insert into travel_region_alias(country_code, raw, canon)
select cc, raw, canon from pair
on conflict (country_code, raw) do nothing;

create or replace function public.travel_admin1_canon(p_cc text, p_a text)
returns text language sql stable set search_path to 'public' as $BODY$
  select coalesce(
    (select canon from travel_region_alias
      where country_code = p_cc and raw = btrim(coalesce(p_a,''))),
    nullif(btrim(coalesce(p_a,'')), ''));
$BODY$;

grant execute on function public.travel_admin1_canon(text, text) to anon, authenticated, service_role;
