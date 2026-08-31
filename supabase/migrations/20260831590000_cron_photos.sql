-- 사진 채우기 크론 — 구글 일일 상한(1,000) 안에서 매일 조금씩.
-- 💰 유료 API 라 우리 장부(places_take)와 구글 콘솔 할당량이 이중으로 막는다.
--    남은 곳이 없으면 called:0 으로 조용히 끝난다(비용 0).
-- ⚠️ places_tried 가 '물어본 사실'을 기억하므로 실패한 집을 다시 묻지 않는다.
select cron.schedule('food_photo_google', '15 3,7,11 * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/ingest-places-photos?n=100&cap=900',
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);

-- 관광공사 사진은 무료라 매일 한 번 훑는다(새로 들어온 장소가 매칭될 수 있다).
select cron.schedule('food_photo_tour', '35 4 * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/ingest-tour-photos',
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
