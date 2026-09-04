-- 혜자식당 씨앗 좌표 붙이기 — 남은 1,565곳.
-- 10분마다 300곳 = 시간당 1,800. 한 시간이면 끝난다. 다 붙으면 대상이 비어 호출이 0이 된다.
-- 3회 실패하면 큐에서 빠진다(착한가격에서 크론이 영원히 헛돌던 그 함정 방지).
select cron.schedule('cheap_geocode', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/geocode-cheap?n=300',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
