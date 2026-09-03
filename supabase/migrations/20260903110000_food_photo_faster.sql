-- 맛집 사진 수집을 크레딧 만료(11/3) 전에 끝낸다 (2026-09-03)
--
-- 상한(places_free_month)을 60,000 으로 올렸는데 **크론이 그걸 못 채운다.**
-- 지금 `?n=150&cap=3000` 이라 시간당 150곳·하루 3,000회가 천장이고,
-- 실제로 어제 2,968회에서 멈췄다. 남은 8,583곳을 이 속도로는 못 끝낸다.
--
-- → 회차당 150 → 300, 하루 상한 3,000 → 10,000.
--   8,583곳 × (검색+사진 2건) ≈ 17,000건 → 이틀이면 끝난다.
-- 💰 실측 건당 ₩2.5 → 약 ₩43,000. 크레딧 ₩416,554 의 10% 다.
--
-- ⚠️ 시간당 300곳이어도 **곳당 최대 2회 호출**이라 초당으로는 0.2회 수준이다.
--    구글은 Nominatim 과 달리 초당 제한이 아니라 결제 기반이라 속도 자체는 문제가 아니다.
-- 🚨 크레딧은 **2026-11-03 만료**. 그 뒤엔 이 설정이 그대로 돈이 된다.
--    되돌리기: cap=1200 · n=150 · places_free_month=11000
select cron.alter_job(
  (select jobid from cron.job where jobname = 'food_photo_google'),
  command := $cmd$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/ingest-places-photos?n=300&cap=10000',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 140000);
  $cmd$);
