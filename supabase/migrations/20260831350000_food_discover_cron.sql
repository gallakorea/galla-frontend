-- 디스커버리 크론 (2026-08-31)
-- 하루 4번 × 4채널 = 16채널/일 → 활성 42채널이 약 2.6일마다 한 바퀴 돈다.
-- ⚠️ 수집(25분)·해소(55분) 크론과 시간을 겹치지 않게 둔다. 같은 검색 키를 쓰므로
--    동시에 돌면 서로 굶는다(21개 동시 실행에서 이미 겪었다).
-- ⚠️ x-cron-secret 필수 — 빠뜨리면 401 인데 pg_cron 이력엔 'succeeded' 로 남는다.
select cron.unschedule('food_discover_job')
 where exists (select 1 from cron.job where jobname='food_discover_job');

select cron.schedule('food_discover_job', '10 2,8,14,20 * * *', $job$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/discover-food-places?n=4',
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 290000);
$job$);

select jobname, schedule, active from cron.job where jobname like 'food%' order by jobname;
