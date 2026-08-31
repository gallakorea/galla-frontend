-- 맛집 수집 크론 (2026-08-31)
--
-- ⚠️ 반드시 x-cron-secret 헤더를 싣는다. 빠뜨리면 함수는 401 인데 pg_cron 이력엔
--    'succeeded' 로 남아 **조용히 아무것도 안 하는 상태**가 된다(갈비스 크론 4개 전례).
--
-- 하루 두 번. 채널 22개 × playlistItems(50편=1유닛) ≈ 22유닛 + 미해소 채널 검색 100유닛씩.
-- 채널 ID 는 한 번 확정되면 캐시되므로 이후 하루 50유닛 미만이다(일 할당량 10,000).
select cron.unschedule('food_collect_job') where exists (select 1 from cron.job where jobname='food_collect_job');

select cron.schedule('food_collect_job', '25 5,17 * * *', $job$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/collect-food-places',
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type', 'application/json'),
    timeout_milliseconds := 300000);
$job$);

select jobname, schedule, active from cron.job where jobname='food_collect_job';
