-- 수확 회차를 '시간 상자'로 바꾼 뒤 편수 상한을 올린다 (2026-09-01)
-- 이제 함수가 110초에서 스스로 끊으므로 n 은 '한 회차 최대'일 뿐 위험하지 않다.
select cron.unschedule('travel_harvest_places_job')
 where exists (select 1 from cron.job where jobname='travel_harvest_places_job');
select cron.schedule('travel_harvest_places_job', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/harvest-travel-places?n=60',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 140000);
$$);
