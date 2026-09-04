-- 콘솔 쿼터를 5,000 → 30,000/일 로 올렸다(기본값 50,000, 심사 없이 즉시 반영).
-- 사용률 73% → 12%. 남은 18,184곳을 하루에 끝낼 수 있다.
--
-- 회차당 150곳이 엣지 150초 제한의 한계다(한 곳당 검색+상세 두 콜). 개수 대신 **주기**를 올린다.
--   5분마다 × 150 = 하루 최대 43,200 → 실제로는 콘솔 30,000 과 자체 상한 25,000 에서 멈춘다.
--   남은 18,184곳이면 **약 6~7시간**.
--
-- ⚠️ 자체 월 상한(places_free_month=25,000)은 그대로 둔다. 코드가 어디서 새면
--    크레딧이 통째로 날아간다 — 콘솔 쿼터만 믿지 않는다. 실측 단가 곳당 ₩6.2 기준
--    25,000곳이면 약 ₩155,000, 잔액 ₩398,079 안이다.
select cron.unschedule('food_photo_google');
select cron.schedule('food_photo_google', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/ingest-places-photos?n=150&cap=30000',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
