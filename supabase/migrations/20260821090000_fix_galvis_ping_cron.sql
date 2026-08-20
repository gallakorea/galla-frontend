/* ══ 선톡 크론이 13일째 죽어 있던 이유 ═════════════════════════
   galvis_ping_daily 는 헤더에 x-cron-key 만 싣고 Authorization 을 안 보냈다.
   엣지 함수는 플랫폼 단에서 Authorization 을 먼저 검사하므로
   함수 코드가 실행되기도 전에 401(UNAUTHORIZED_NO_AUTH_HEADER)로 끊긴다.
   그런데 net.http_post 자체는 성공하므로 cron.job_run_details 에는
   'succeeded' 로 찍힌다 — 그래서 아무도 못 알아챘다.
   (마지막 선톡 2026-08-08, 그 뒤 13일간 0건. 대상자는 4명 있었다.)

   ⚠️ 같은 형태로 죽어 있는 크론이 셋 더 있다:
      distill-failures-daily · galvis-craftbench-weekly · galvis-redteam-weekly
      이들은 돌면 API 비용과 테스트 데이터가 발생해 여기서 같이 켜지 않는다.
      켤 때는 이 파일과 같은 방식으로 Authorization 만 보강하면 된다.

   서비스 키는 커맨드에 평문으로 박지 않고 vault(svc_role_key)에서 읽는다.
   키 값은 이미 정상 동작 중인 크론 커맨드에서 DB 안에서만 추출한다. */

do $fix$
declare k text;
begin
  if exists (select 1 from vault.decrypted_secrets where name = 'svc_role_key') then
    raise notice 'svc_role_key 이미 있음';
  else
    select (regexp_match(command, 'Bearer (eyJ[A-Za-z0-9._-]+)'))[1] into k
      from cron.job where jobname = 'weather_sync_job';
    if k is null then raise exception '정상 크론에서 서비스 키를 찾지 못했다'; end if;
    perform vault.create_secret(k, 'svc_role_key', '엣지 함수 크론 호출용 service_role 키');
  end if;
end $fix$;

do $fix$
declare c text; d text := chr(36) || chr(36);   -- '$$' 를 리터럴로 (달러 인용 충돌 회피)
begin
  select command into c from cron.job where jobname = 'galvis_ping_daily';
  if c is null then raise exception 'galvis_ping_daily 크론이 없다'; end if;
  if c ilike '%Authorization%' then raise notice '이미 보강됨'; return; end if;

  c := replace(
         c,
         d || 'x-cron-key' || d || ',',
         d || 'Authorization' || d || ', ' || d || 'Bearer ' || d
           || ' || (select decrypted_secret from vault.decrypted_secrets where name='
           || d || 'svc_role_key' || d || '), '
           || d || 'x-cron-key' || d || ','
       );

  /* cron.schedule 은 같은 이름이면 덮어쓴다 — alter_job 시그니처(job_id)보다 안전하다 */
  perform cron.schedule('galvis_ping_daily',
    (select schedule from cron.job where jobname = 'galvis_ping_daily'), c);
  raise notice '선톡 크론 Authorization 보강 완료';
end $fix$;

do $chk$
begin
  if not exists (select 1 from cron.job
                  where jobname = 'galvis_ping_daily'
                    and command ilike '%Authorization%'
                    and command ilike '%x-cron-key%'
                    and active) then
    raise exception '선톡 크론 보강 실패';
  end if;
  raise notice '점검 통과';
end $chk$;
