-- 여행 수집 크론 (2026-09-01)
--
-- 두 축을 따로 돌린다. 하나가 죽어도 다른 하나는 계속 돈다.
--   ① 영상 수집  : 2시간마다 6채널 (playlistItems 1유닛/50편 → 하루 100유닛 남짓)
--   ② 장소 수확  : 20분마다 1채널 6편 (LLM + 지오코딩. 라운드로빈이라 채널이 골고루 돈다)
--   ③ 채널 해석  : 하루 한 번, 이름만 아는 채널 1개씩 (search.list 100유닛 — 몰아 쓰면 그날 쿼터가 죽는다)
--
-- ⚠️ Authorization/x-cron-secret 을 빼면 401 인데 pg_cron 이력엔 'succeeded' 로 남는다.
--    조용히 아무 일도 안 하는 상태가 된다 — 갈비스 크론 4개가 실제로 그랬다.
-- ⚠️ timeout 은 엣지 유휴(150초)보다 짧게 잡는다. 넘기면 실행이 통째로 날아가고 흔적이 없다.
-- ⚠️ 수확 주기를 15분 밑으로 내리지 말 것. Nominatim 은 무료지만 정책상 초당 1회이고,
--    하루 장부(travel_geo_budget.cap=1500)를 넘기면 그날 수확이 통째로 멈춘다.

select cron.unschedule('travel_collect_videos_job') where exists (select 1 from cron.job where jobname='travel_collect_videos_job');
select cron.schedule('travel_collect_videos_job', '17 */2 * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/collect-travel-videos?channels=6&pages=1&resolve=0',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 140000);
$$);

select cron.unschedule('travel_harvest_places_job') where exists (select 1 from cron.job where jobname='travel_harvest_places_job');
select cron.schedule('travel_harvest_places_job', '*/20 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/harvest-travel-places?n=6',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 140000);
$$);

select cron.unschedule('travel_resolve_channels_job') where exists (select 1 from cron.job where jobname='travel_resolve_channels_job');
select cron.schedule('travel_resolve_channels_job', '40 4 * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/collect-travel-videos?channels=2&pages=1&resolve=1',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 140000);
$$);
