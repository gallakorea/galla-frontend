-- 태그 수집 — 유튜브 할당량 리셋 직후(07:00 UTC = 16:00 KST)에 번역과 나란히 잡는다.
-- 9,359편 ÷ 50 = 188유닛. 번역(257)과 합쳐도 하루 10,000 중 5% 미만이다.
-- 다 받으면 대상이 비어 호출이 0이 된다. 새 영상은 수집되는 대로 여기 걸린다.
select cron.schedule('food_video_tags', '2-57/5 7 * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/fetch-video-i18n?mode=tags&rounds=30',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
