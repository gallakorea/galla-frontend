-- 회차당 개수를 올리는 대신 **자주** 돌린다.
--
-- 경로를 둘로 나눈 뒤(무료 검색 + Details Pro) 한 곳당 HTTP 호출이 둘이 됐다.
-- 그래서 n=300·200 은 엣지 150초 제한에 걸려 통째로 죽는다(실측: 500몫 증발).
-- 한 회차는 150곳이 한계다. 대신 2시간마다 → **1시간마다** 로 바꿔 하루 3,600 을 노린다.
-- 실제로는 장부의 일 상한 3,000 에서 멈춘다.
select cron.unschedule('food_photo_google');
select cron.schedule('food_photo_google', '15 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/ingest-places-photos?n=150&cap=3000',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
