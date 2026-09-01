-- 착한가격업소 8,813곳을 가게로 들이는 크론.
--
-- 예산 계산(하루 20,000):
--   지자체 수집  30분마다 ×2 ×cap 60 = 최대 5,760
--   크리에이터 수확                  = 최대   432
--   착한가격 좌표 15분마다 ×100      = 최대 9,600  ← 8,813곳이면 하루면 끝난다
--   합계 약 15,800 — 한도 아래다. discover 는 한 건씩 받아 쓰며 스스로 멈춘다.
--
-- 다 들이고 나면 todo 가 비어 호출이 0이 된다. 분기마다 원본이 갱신되면 새 업소만 집는다.
select cron.schedule('good_price_resolve', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/ingest-good-price?resolve=1&n=100',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
