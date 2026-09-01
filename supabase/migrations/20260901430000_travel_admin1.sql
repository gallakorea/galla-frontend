-- 지역 2단 내비게이션 + 수확량 상향 (2026-09-01)
--
-- 사장님: "둘러보기에서 나라·지역 검색을 더 자세히. 적어도 일본 도쿄까지는 나와야 함."
--
-- ⚠️ city 컬럼만으로는 그게 안 된다. Nominatim 이 주는 city 는 **기초자치단체**라
--    도쿄가 '지요다구'·'미나토구'로, 교토가 '교토시'로 흩어진다(실측). 유저가 찾는 건 '도쿄'다.
--    → 광역(state/prefecture)을 admin1 로 따로 저장하고 2단계 칩의 축으로 쓴다.
--      일본이면 도쿄도·교토부·오사카부, 한국이면 서울특별시·부산광역시가 여기 들어간다.
alter table public.travel_places add column if not exists admin1 text;
create index if not exists travel_places_admin1
  on public.travel_places (country_code, admin1) where status='live';

-- 수확 회차당 영상 수를 6 → 20 으로. 실측: 14편이 40초였다(엣지 유휴 150초).
-- 병목은 지오코딩 장부가 아니라 추출 수율이었다 — 장부는 3,000 중 64건만 썼다.
select cron.unschedule('travel_harvest_places_job')
 where exists (select 1 from cron.job where jobname='travel_harvest_places_job');
select cron.schedule('travel_harvest_places_job', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/harvest-travel-places?n=20',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
