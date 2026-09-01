-- 회차 편수 상한을 시계에 맡긴다 (2026-09-01)
-- 함수 안 상한이 20이라 시간 상자(110초)를 못 채우고 54초에 끝나고 있었다.
-- 이제 시계가 안전장치이므로 크론도 넉넉히 요청한다.
select cron.unschedule('travel_harvest_places_job')
 where exists (select 1 from cron.job where jobname='travel_harvest_places_job');
select cron.schedule('travel_harvest_places_job', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/harvest-travel-places?n=100',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 140000);
$$);
