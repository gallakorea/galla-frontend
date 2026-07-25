-- predict_issue_market_job 크론이 계속 실패하던 것 수정
-- 증상: cron.job_run_details에 'ERROR: admin_only' (2026-07-24부터 연속 실패).
-- 원인: 이 크론만 엣지 함수를 거치지 않고 DB 안에서 admin_create_issue_market()을 직접 부른다.
--       pg_cron은 JWT가 없어 auth.role()=null, auth.uid()=null → _is_admin() false → admin_only.
--       (엣지 함수를 거치는 다른 크론들은 service_role 키를 실어 보내므로 통과했다.)
--
-- ⚠️ 시도했다가 되돌린 방법: _require_admin_or_service()에 current_user 예외를 추가하는 것.
--    SECURITY DEFINER 함수 안에서 current_user는 '호출자'가 아니라 '함수 소유자(postgres)'다.
--    실측으로 확인: anon 롤로 불러도 current_user='postgres'.
--    즉 그 예외를 넣으면 관리자 검사가 누구에게나 통과하는 구멍이 된다. 공용 가드는 건드리지 않는다.
--
-- 대책: 크론 전용 래퍼 하나만 만든다. 이 래퍼는 트랜잭션 한정으로 service_role 클레임을 세워
--       기존 가드를 정상 경로로 통과한 뒤 원래 함수를 부른다. anon/authenticated에는 실행권한을
--       주지 않으므로 PostgREST(외부)에서는 호출할 수 없다.

-- 공용 가드 원상복구(혹시 위 시도가 적용돼 있다면 되돌린다)
create or replace function _require_admin_or_service()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then return; end if;
  if coalesce(_is_admin(), false) then return; end if;
  raise exception 'admin_only' using errcode = '42501';
end $$;

-- 크론 전용 래퍼
create or replace function cron_create_issue_market()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v jsonb;
begin
  -- true = 트랜잭션 한정. 이 호출이 끝나면 사라진다.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  select admin_create_issue_market() into v;
  return v;
end $$;

revoke all on function cron_create_issue_market() from anon, authenticated, public;

-- 크론이 래퍼를 부르도록 교체
do $$
declare v_id bigint;
begin
  select jobid into v_id from cron.job where jobname = 'predict_issue_market_job';
  if v_id is null then
    raise notice 'predict_issue_market_job 없음 — 스킵';
    return;
  end if;
  perform cron.alter_job(v_id, command => 'select cron_create_issue_market();');
end $$;
