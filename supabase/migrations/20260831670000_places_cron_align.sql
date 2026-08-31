-- 사진 크론이 구글의 하루 밖으로 새어 있었고, 쓰는 양도 상한의 3분의 1이었다.
--
--  ① 시각: 기존 03/07/11 UTC 는 태평양시로 20시·00시·04시라 **전날 몫에 한 번 걸친다**.
--     그 회차는 구글이 이미 닫힌 뒤라 429 만 맞았다. 전부 같은 태평양 날짜 안으로 옮긴다.
--  ② 양:  100콜 × 3회 = 300/일. 상한이 1,000인데 3분의 1만 썼다 —
--         8,500곳을 채우는 데 28일이 걸린다. 120 × 8회 = 960/일로 올린다(상한 안).
select cron.unschedule('food_photo_google');
select cron.schedule('food_photo_google', '15 7,9,11,13,15,17,19,21 * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/ingest-places-photos?n=120&cap=900',
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
