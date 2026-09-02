-- 착한가격 첫 바퀴가 끝났다(2026-09-02 16:26). 크론을 재시도용으로 늦춘다.
--
-- 결과: 9,014행 중 6,867곳(76%) 연결, 새 가게 6,453곳, 메뉴 14,650개.
-- 남은 2,147곳은 **전부 이미 시도했다가 네이버가 못 찾은 집**이다(폐업·상호 불일치).
--
-- ⚠️ 이대로 두면 10분마다 그 2,147곳을 다시 물어본다. 회차당 120콜인데 거의 다 헛방이다.
--    하루 20,000 중 12,135 를 이미 썼고, 지자체 수집이 나머지를 써야 한다.
--    재시도 자체는 값이 있다(네이버에 나중에 등록되는 집이 있다) — 다만 하루 한 번이면 족하다.
select cron.unschedule('good_price_resolve');
select cron.schedule('good_price_resolve', '40 6 * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/ingest-good-price?resolve=1&n=200',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
