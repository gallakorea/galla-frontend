-- 설명 채우기 크론 (2026-09-01) — 30분마다 20곳
select cron.unschedule('travel_summaries_job') where exists (select 1 from cron.job where jobname='travel_summaries_job');
select cron.schedule('travel_summaries_job', '12,42 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/travel-summaries?n=20',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
