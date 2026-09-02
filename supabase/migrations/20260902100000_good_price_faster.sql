-- 착한가격 수집 속도를 올린다. 15분마다 100 → **10분마다 120**.
--
-- 근거: 자정부터 10시간 돌려본 실측이 기준이다.
--   적중률 87~93%, 회차당 메뉴 130~200개, 네이버는 회차당 정확히 100콜.
--   오전 10시 기준 네이버 6,806/20,000 — 착한가격이 3,500, 지자체가 나머지다.
--   남은 착한가격 약 5,300콜 + 서울 업무추진비 약 1,800 = 7,100. 몫은 13,000 남았다.
--   즉 두 배로 올려도 서로 안 밟는다(경기는 어제 끝났다).
--
-- 완료 예상: 자정 → **오후 5시대**로 8시간 당겨진다.
-- ⚠️ 다 들이고 나면 todo 가 비어 호출이 0이 된다. 상한을 다시 내릴 필요는 없다.
select cron.unschedule('good_price_resolve');
select cron.schedule('good_price_resolve', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/ingest-good-price?resolve=1&n=120',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
