-- 운영 로그 자동 정리 — 이걸 안 걸면 몇 주마다 서비스가 선다 (2026-09-03)
--
-- 🚨 실제로 오늘 앱이 섰다. 증상: 정적 페이지는 200 인데 데이터 조회가 5~20초 걸리거나
--    `57014 canceling statement due to statement timeout` 으로 실패했다.
--    vacuum 도 아니고 락도 아니고 연결도 25개뿐인데 `select id from travel_places limit 1`
--    이 8초였다.
--
-- 원인은 **자동 정리가 없는 운영 로그 두 개**였다(DB 1,234MB 중 270MB):
--   · cron.job_run_details  191MB — pg_cron 은 실행 이력을 **영원히** 쌓는다.
--     크론 70개가 분 단위로 돌면 하루에 수만 행이다.
--   · net._http_response     79MB — pg_net 도 응답을 쌓아두기만 한다.
--     크론이 net.http_post 로 엣지 함수를 부를 때마다 한 행씩 남는다.
--   둘 다 비우자 20초 → 0.2초로 즉시 회복됐다.
--
-- ⚠️ 크론을 새로 붙일 때마다 이 두 테이블이 더 빨리 자란다. 오늘 여행 크론 5개를 추가한 게
--    임계점을 앞당겼다. **크론을 늘릴 거면 이 정리도 같이 있어야 한다.**
-- ⚠️ 서비스 데이터가 아니다. 잃는 건 크론 실행 이력뿐이고, 진단에 필요한 최근 3일은 남긴다.
create or replace function public.prune_ops_logs()
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_cron int; n_net int;
begin
  with d as (delete from cron.job_run_details
              where end_time < now() - interval '3 days' returning 1)
  select count(*) into n_cron from d;
  /* pg_net 응답은 크론이 던지고 안 읽는다 — 한 시간이면 진단에도 충분하다 */
  with d as (delete from net._http_response
              where created < now() - interval '2 hours' returning 1)
  select count(*) into n_net from d;
  return jsonb_build_object('ok', true, 'cron_rows', n_cron, 'net_rows', n_net);
end $$;

revoke all on function public.prune_ops_logs() from public, anon, authenticated;

-- 하루 두 번(새벽·정오). 쌓이는 속도가 하루 수만 행이라 하루 한 번으로는 아슬아슬하다.
select cron.schedule('ops_log_prune', '13 3,15 * * *',
  $cmd$ select public.prune_ops_logs(); $cmd$);
