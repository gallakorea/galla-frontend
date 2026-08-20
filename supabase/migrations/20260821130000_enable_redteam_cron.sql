/* ══ 레드팀 회귀 크론 되살리기 ═══════════════════════════════════
   선톡과 동일한 원인으로 죽어 있었다 — 헤더에 x-cron-key 만 있고
   Authorization 이 없어 플랫폼에서 401. cron 이력엔 'succeeded' 로 찍혀
   12일(마지막 실행 2026-08-09) 동안 아무도 못 알아챘다.

   안전 확인: galvis-redteam 은 유저를 새로 만들지 않는다. 영구 풀 3계정
   (redteam-pool-*@galla.im)으로 로그인해 돌고, 그 계정들은 gallian_cache 등
   실유저 통계에 섞이지 않는다(실측 0건).
   비용: 마지막 실행일 실측 $0.31(1,476콜). 주 1회면 월 약 1,700원.

   ⚠️ 같은 이유로 아직 죽어 있는 둘은 여기서 안 켠다(사장님 판단 대기):
      distill-failures-daily · galvis-craftbench-weekly */

do $fix$
declare c text; d text := chr(36) || chr(36);
begin
  select command into c from cron.job where jobname = 'galvis-redteam-weekly';
  if c is null then raise exception 'galvis-redteam-weekly 크론이 없다'; end if;
  if c ilike '%Authorization%' then raise notice '이미 보강됨'; return; end if;

  c := replace(c,
         d || 'x-cron-key' || d || ',',
         d || 'Authorization' || d || ', ' || d || 'Bearer ' || d
           || ' || (select decrypted_secret from vault.decrypted_secrets where name='
           || d || 'svc_role_key' || d || '), '
           || d || 'x-cron-key' || d || ',');

  /* 레드팀은 오래 걸린다 — 응답 타임아웃을 넉넉히(요청 자체는 fire-and-forget). */
  if c not ilike '%timeout_milliseconds%' then
    c := regexp_replace(c, '\)\s*;?\s*$', ', timeout_milliseconds:=300000)');
  end if;

  perform cron.schedule('galvis-redteam-weekly',
    (select schedule from cron.job where jobname = 'galvis-redteam-weekly'), c);
  raise notice '레드팀 크론 복구';
end $fix$;

do $chk$
begin
  if not exists (select 1 from cron.job where jobname='galvis-redteam-weekly'
                  and command ilike '%Authorization%' and active) then
    raise exception '레드팀 크론 보강 실패';
  end if;
  raise notice '점검 통과';
end $chk$;
