-- 크레딧이 Places API 에 붙는 게 확인됐다(실측 2026-09-02: ₩194 발생 → 기타 절감 -₩194 → 합계 ₩0).
-- 이제 남은 방송·공직자 맛집 9,500곳을 채운다.
--
-- 속도를 정하는 건 우리 장부가 아니라 **구글 콘솔 쿼터(SearchTextRequest 일 1,000)** 다.
-- 그래서 일 상한을 950 으로 올려 콘솔 한도 바로 아래까지 쓰고, 회차당 150 으로 늘린다.
-- 8회 × 150 = 1,200 이지만 일 상한 950 에서 멈춘다. 9,500곳이면 약 10일이다.
--
-- 비용: 새 경로(Essentials 무료 + Details Pro $17/1,000 + Photos $7/1,000)로 곳당 약 ₩32.
--   Details Pro 는 월 5,000 무료라 두 달에 나눠 돌면 대부분 무료 한도 안이다.
--   실제 유료는 ₩5~12만 수준 — 크레딧 잔액 ₩435,329(만료 2026-11-03)로 넉넉하다.
select cron.unschedule('food_photo_google');
select cron.schedule('food_photo_google', '15 1,4,7,10,13,16,19,22 * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/ingest-places-photos?n=150&cap=950',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
