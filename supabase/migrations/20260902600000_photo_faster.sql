-- 구글 콘솔 쿼터를 1,000 → 5,000/일 로 올렸다(기본값 50,000, 심사 없이 즉시 반영).
-- 우리 크론도 그에 맞춰 올린다. 다만 **전량을 9월에 몰아넣으면 크레딧을 넘긴다.**
--
-- 남은 18,893곳을 어떻게 나누느냐로 총액이 갈린다 —
-- 무료 한도가 **매달 리셋**되기 때문이다(Place Details Pro 5,000/월, Photos 1,000/월):
--
--   9월에 전량      Details 13,893유료 + Photos 12,200유료 = $321 ≈ ₩466,000  ❌ 크레딧 초과
--   9·10월 분할      Details  8,900유료 + Photos 11,200유료 = $229 ≈ ₩332,000  ✅ 여유 ₩10만
--
-- 나누는 게 ₩134,000 싸다. 그래서 9월엔 **사장님이 화면에서 보는 yt·gov 8,954곳만**
-- 끝내고, 착한가격·관광공사 잔여분(9,939곳)은 10월 무료 한도로 넘긴다.
--
--   9월: 1,802(이미 씀) + 8,954 = 10,756 → 장부 상한 11,000
--   하루 3,000 이면 yt·gov 는 **3일**이면 끝난다(9/5).
--   상한에 닿으면 크론이 스스로 멈춘다 — 10월 1일에 장부가 리셋되며 알아서 재개된다.
update app_settings set v = jsonb_build_object('calls', 11000) where k = 'places_free_month';

select cron.unschedule('food_photo_google');
select cron.schedule('food_photo_google', '15 */2 * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/ingest-places-photos?n=300&cap=3000',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
