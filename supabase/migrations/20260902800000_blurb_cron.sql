-- 영상 한 줄 요약 채우기 — 남은 900편을 크론에 맡긴다.
--
-- 회차당 40편(LLM 40콜), 10분마다 = 시간당 240편 → 약 4시간이면 끝난다.
-- DeepSeek 은 저렴해서 900콜이 몇백 원 수준이다.
-- 다 채우면 food_videos_to_blurb 가 빈 배열을 줘서 호출이 0이 된다 — 끄지 않아도 된다.
-- 앞으로 수확되는 영상은 harvest 가 같은 호출에서 blurb 를 받으므로 여기 올 일이 거의 없다.
select cron.schedule('food_video_blurb', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/summarize-food-videos?n=40',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
