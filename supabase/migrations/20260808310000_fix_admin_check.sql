-- 🔐 관리자 판정이 깨져 있던 함수 3종 수정 (2026-08-08)
--
--  admin_flag는 users가 아니라 user_profiles에 있고, 공용 헬퍼 _is_admin()을 쓰는 것이 이 코드베이스 규약이다.
--  그런데 세 함수가 `users where id=auth.uid() and coalesce(admin_flag,false)`를 참조하고 있었다
--  → 존재하지 않는 컬럼이라 호출 즉시 42703 에러. 즉 **관리자가 열면 화면이 깨진다.**
--  admin_ai_budget은 이번 작업 이전부터 있던 것으로, AI 예산 화면이 계속 실패하고 있었을 것이다.
create or replace function public.admin_ai_budget()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v jsonb;
begin
  if not _is_admin() then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  select jsonb_agg(jsonb_build_object('fn', fn, 'calls', calls, 'day', day) order by calls desc)
    into v from ai_budget_usage where day = (now() at time zone 'Asia/Seoul')::date;
  return jsonb_build_object('ok', true, 'today', coalesce(v, '[]'::jsonb),
    'caps', (select v from app_settings where k = 'ai_daily_caps'));
end $$;
