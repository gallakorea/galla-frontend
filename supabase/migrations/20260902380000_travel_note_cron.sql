-- 장소별 한 줄 채우기 크론 (2026-09-02)
--
-- 사장님: "영상에 장소가 다양하더라도 장소마다 다 뜨게 해야 함."
-- ?notes=1 은 두 가지를 한다:
--   ① travel_note_from_gist — 한 곳짜리 영상(74%)은 영상 요약을 그대로 복사한다. **AI 안 부른다.**
--   ② 여러 곳 나오는 영상(26%)만 AI 에 물어 곳마다 다른 한 줄을 받는다.
-- ⚠️ 요약(gist) 크론보다 **뒤에** 돈다. gist 가 있어야 ①이 복사할 게 생긴다.
--    같은 분에 겹치면 DeepSeek 호출이 몰리므로 5분 어긋나게 둔다.
select cron.schedule(
  'travel_note_job', '7,27,47 * * * *', $cmd$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/travel-gist?notes=1',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 140000);
  $cmd$);
