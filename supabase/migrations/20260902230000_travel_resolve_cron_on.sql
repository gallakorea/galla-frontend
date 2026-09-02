-- 채널 해석 크론에 search 폴백을 다시 켠다 (2026-09-02)
--
-- 지금까지 resolve=0 이었다. 핸들이 안 풀린 채널은 핸들 시도만 반복하는데 그건 이미
-- 실패한 시도라, **영영 안 풀리고 영상 0편으로 남았다**(113개 중 26개가 그 상태였다).
--
-- 💰 search.list = 호출당 100유닛. 어디에 켜느냐가 전부다:
--   · travel_resolve_channels_job (하루 1회) → resolve=1 = 하루 100유닛.  ← 여기만 켠다
--   · travel_collect_videos_job   (2시간마다·하루 12회) → 켜면 하루 1,200유닛. 안 켠다.
--     이건 '평상시 영상 수집'이라 해석이 일이 아니다.
--
-- ⚠️ 2026-09-02 에 실제로 쿼터를 소진시켰다(403). 미해결 채널을 빨리 풀려고
--    resolve=3 으로 6회를 몰아 돌려 1,352유닛을 썼고, 핫튜브·맛집이 쓰던 6~7천에 얹혀
--    10,000 한도를 넘겼다. **같은 키를 쓰는 핫튜브 수집이 그날 같이 멈췄다.**
--    하루 1개(100유닛)로 묶어두면 이런 일이 구조적으로 안 생긴다.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'travel_resolve_channels_job'),
  command := $cmd$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/collect-travel-videos?unresolved=1&channels=8&pages=1&resolve=1',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 140000);
  $cmd$);
