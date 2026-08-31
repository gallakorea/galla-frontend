-- 대기열 해소 크론 — 수집(05:25/17:25) 30분 뒤에 돈다
-- ⚠️ x-cron-secret 필수. 빠뜨리면 401 인데 pg_cron 이력엔 'succeeded' 로 남는다.
select cron.unschedule('food_resolve_job') where exists (select 1 from cron.job where jobname='food_resolve_job');
select cron.schedule('food_resolve_job', '55 5,17 * * *', $job$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/resolve-food-pending?limit=60',
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 280000);
$job$);
select jobname, schedule, active from cron.job where jobname like 'food%' order by jobname;
