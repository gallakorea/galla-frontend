-- 서울시 업무추진비 수집을 크론에 올린다. 16.7만 행이라 한 번에 못 끝낸다 —
-- 커서(gov_ingest_cursor)가 있어 매 회차 이어서 읽는다.
--
-- ⚠️ 주기를 더 짧게 잡지 않는다. 병목은 서울 API 가 아니라 **네이버 지역검색**이다.
--    회차당 100콜 × 하루 96회 = 9,600콜. 네이버 일일 한도(25,000) 안이고,
--    크리에이터 수확도 같은 API 를 쓰므로 여유를 남긴다.
-- ⚠️ 다 읽으면 함수가 '더 없음'을 돌려주고 조용히 끝난다 — 별도 정지 장치가 필요 없다.
select cron.schedule('gov_expense_seoul', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/ingest-gov-expense?n=300&cap=100',
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
