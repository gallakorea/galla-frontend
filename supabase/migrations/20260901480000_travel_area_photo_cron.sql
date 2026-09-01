-- 나라·지역 사진 크론 (2026-09-01)
-- 장소가 새 나라·새 광역으로 퍼질 때마다 대표 사진이 필요해진다. 30분마다 조금씩 채운다.
-- (위키데이터·커먼즈는 무료지만 예의를 지킨다 — 회차당 14건, 호출 사이 150ms)
select cron.unschedule('travel_area_photos_job')
 where exists (select 1 from cron.job where jobname='travel_area_photos_job');
select cron.schedule('travel_area_photos_job', '7,37 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/travel-area-photos?n=14',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
