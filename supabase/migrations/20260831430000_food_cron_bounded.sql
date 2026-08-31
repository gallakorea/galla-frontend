-- 크론이 조용히 잘리고 있었다 — 엣지 함수는 유휴 150초에서 끊긴다.
-- 수집기가 채널 57개를 한 바퀴 돌려다 IDLE_TIMEOUT(504) 로 죽었고, 그 실행은 통째로
-- 날아갔는데 pg_cron 이력엔 아무 표시가 없다(크론 인증 함정과 같은 종류의 침묵).
-- → 한 실행에 도는 채널 수를 묶고(n), 대신 자주 돈다.
select cron.unschedule('food_collect_job');
select cron.unschedule('food_discover_job');

select cron.schedule('food_collect_job', '25 2,8,14,20 * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/collect-food-places?n=8&resolve=3',
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type', 'application/json'),
    timeout_milliseconds := 200000);
$$);

-- 디스커버리는 회차(wave)가 돌수록 다른 표현·지역을 훑는다 — 자주 돌수록 커버리지가 쌓인다.
select cron.schedule('food_discover_job', '40 1,5,9,13,17,21 * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/discover-food-places?n=6',
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 200000);
$$);
