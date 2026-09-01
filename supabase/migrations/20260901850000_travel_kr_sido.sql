-- 국내 광역명 표준화 (2026-09-01) — 사장님: "부산·부산광역시 중복 문제 있음"
--
-- 소스마다 시도 표기가 다르다:
--   국가유산청 → '부산', '경북'      (축약형)
--   OSM·관광공사 → '부산광역시', '경상북도' (정식명)
-- 그래서 지역 타일에 같은 곳이 두 번 뜬다.
-- 앱의 표준은 **축약형**이다(weather_regions 17개: 서울·인천·경기·강원…). 날씨·맛집 탭이 그걸 쓴다.
-- 여행도 거기 맞춘다 — 나중에 지역 축을 공유하려면 표기가 같아야 한다.
create or replace function public.travel_kr_sido(p text)
returns text language sql immutable as $fn$
  select case
    when p is null or btrim(p) = '' then null
    when p ~ '^서울' then '서울'   when p ~ '^부산' then '부산'
    when p ~ '^대구' then '대구'   when p ~ '^인천' then '인천'
    when p ~ '^대전' then '대전'   when p ~ '^울산' then '울산'
    when p ~ '^세종' then '세종'   when p ~ '^경기' then '경기'
    when p ~ '^강원' then '강원'   when p ~ '^(충북|충청북)' then '충북'
    when p ~ '^(충남|충청남)' then '충남'
    when p ~ '^(전북|전라북)' then '전북'
    /* ⚠️ '전남광주통합특별시'는 우리 데이터의 실제 표기다. 이걸 '전남'이나 '광주'로 쪼개면
       광주 장소가 전남으로 잘못 붙는다 — 한 이름으로 모으기만 하고 쪼개지 않는다. */
    when p ~ '전남광주' then '전남광주'
    when p ~ '^(전남|전라남)' then '전남'
    when p ~ '^광주' then '광주'
    when p ~ '^(경북|경상북)' then '경북'
    when p ~ '^(경남|경상남)' then '경남'
    when p ~ '^제주' then '제주'
    when p = '기타' then null                  -- 국가유산청의 '기타'는 지역이 아니다
    else p end;
$fn$;
grant execute on function public.travel_kr_sido(text) to anon, authenticated;

-- 이미 쌓인 행 표준화
update travel_places
   set admin1 = travel_kr_sido(admin1), updated_at = now()
 where country_code = 'KR' and admin1 is not null
   and admin1 is distinct from travel_kr_sido(admin1);

-- 지역 배너 키도 같이 옮긴다(안 옮기면 타일 사진이 사라진다)
delete from travel_area_photos a
 where a.scope = 'area' and a.code like 'KR|%'
   and exists (select 1 from travel_area_photos b
                where b.scope='area'
                  and b.code = 'KR|' || travel_kr_sido(substring(a.code from 4))
                  and b.code <> a.code);
update travel_area_photos
   set code = 'KR|' || travel_kr_sido(substring(code from 4)),
       name = travel_kr_sido(substring(code from 4))
 where scope='area' and code like 'KR|%'
   and travel_kr_sido(substring(code from 4)) is not null
   and code <> 'KR|' || travel_kr_sido(substring(code from 4));
