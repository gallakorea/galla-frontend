-- 유료 해석 중단 (2026-09-01) — 사장님: "유료 하지마. 내가 주소 알아 올 테니 리스트 줘."
-- 크론을 핸들 전용(resolve=0)으로 내린다. search.list(100유닛)는 이제 자동으로 안 나간다.
-- 남은 채널은 사장님이 유튜브 주소를 주면 UC 를 그대로 박는다(비용 0).
select cron.unschedule('travel_resolve_channels_job')
 where exists (select 1 from cron.job where jobname='travel_resolve_channels_job');
select cron.schedule('travel_resolve_channels_job', '40 4 * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/collect-travel-videos?unresolved=1&channels=8&pages=1&resolve=0',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
