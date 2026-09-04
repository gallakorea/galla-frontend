-- 사진을 **한 번에 다 채운다**. 크레딧이 11월 3일에 소멸하므로 아껴야 할 이유가 없다.
--
-- 실측 단가(2026-09-04, 콘솔 크레딧 잔액 대조):
--   9/2 20:40  잔액 ₩432,008 · 조회 1,802 · 사진 1,090
--   9/4 지금   잔액 ₩398,079 · 조회 7,284 · 사진 4,347
--   → 5,482곳에 ₩33,929 = **곳당 약 ₩6.2**
--   내가 앞서 추정한 ₩32~35 보다 5배 싸다. Place Details Pro 월 5,000 무료가 꽤 먹어주고
--   사진도 상당수가 무료 한도 안이었다. '9월/10월로 쪼개서 아끼자'는 계산은 무의미해졌다.
--
-- 남은 미시도 18,184곳 × ₩6.2 ≈ **₩113,000**. 잔액 ₩398,079 로 넉넉하다.
--
-- 속도는 구글 콘솔 쿼터(SearchTextRequest 5,000/일)가 정한다. 18,184곳이면 약 4일.
-- ⚠️ 자체 월 상한을 넉넉히 두되 무한대로 두지 않는다 — 코드가 어디서 새면 크레딧이 통째로
--    날아간다. 남은 물량 + 여유만큼만 준다.
update app_settings set v = jsonb_build_object('calls', 25000) where k = 'places_free_month';

-- 회차당 150곳(엣지 150초 제한), 매시간 → 20분마다. 하루 최대 약 3,240 → 콘솔 5,000 안.
select cron.unschedule('food_photo_google');
select cron.schedule('food_photo_google', '15,35,55 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/ingest-places-photos?n=150&cap=5000',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
