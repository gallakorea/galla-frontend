-- 채널 해석 크론 상향 (2026-09-01)
-- 사장님: "크리에이터 확보 우선."
-- 핸들 추정(1유닛)이 먼저 돌고, 안 되면 회차당 2건만 검색(200유닛)한다.
-- 하루 4회 = 최대 800유닛. 핫튜브(6~7천)와 맛집을 굶기지 않는 선이다.
-- ⚠️ 이보다 올리지 말 것. 유튜브 쿼터가 마르면 핫튜브 피드가 통째로 빈다(유저가 바로 본다).
select cron.unschedule('travel_resolve_channels_job')
 where exists (select 1 from cron.job where jobname='travel_resolve_channels_job');
select cron.schedule('travel_resolve_channels_job', '40 1,7,13,19 * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/collect-travel-videos?unresolved=1&channels=6&pages=1&resolve=2',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
