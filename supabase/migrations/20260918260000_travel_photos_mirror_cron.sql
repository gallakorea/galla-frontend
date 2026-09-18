-- 새로 모인 외부 사진(위키미디어·관광공사 — 여행·맛집)을 30분마다 우리 R2 로 옮긴다.
-- 26.9.18 일괄 이전 18,367장 완료(실패 0). 이후엔 이 크론이 따라간다.
select cron.unschedule('travel_photos_mirror_job') where exists (select 1 from cron.job where jobname = 'travel_photos_mirror_job');
select cron.schedule('travel_photos_mirror_job', '11,41 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/travel-photos-mirror?n=40&par=2',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
