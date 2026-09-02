-- 영상 요약 채우기 크론 (2026-09-02)
--
-- 대상 16,306편. 10편씩 묶어 물어보므로 호출은 약 1,600번이고, 한 회차(110초)에
-- 200편쯤 처리한다 → 약 80회차. 5분 주기면 7시간 남짓이면 끝난다.
-- ⚠️ 수확 크론(*/5)과 시간을 어긋나게 둔다. 같은 분에 겹치면 DeepSeek 호출이 몰린다.
-- ⚠️ 유튜브·Nominatim 과 무관한 작업이라 그쪽 한도에는 영향이 없다.
--    다 채워지면 travel_videos_to_gist 가 빈 배열을 주고 회차가 즉시 끝난다(공짜로 돈다).
select cron.schedule(
  'travel_gist_job', '2,12,22,32,42,52 * * * *', $cmd$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/travel-gist?n=200',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 140000);
  $cmd$);
