-- 🎁 가입 웰컴 보너스 — 가입하면 무조건 +500 GP(유저당 1회). 투어 시청과 무관.
-- 중복 방지: 이미 가입 계열 +500(웰컴/초대가입/구 투어보너스)을 받았으면 재지급 안 함.
--   → 초대로 가입한 사람(referral:join +500)은 여기서 스킵돼 총 +500 유지(더블 없음).
--   → 그냥 가입한 사람은 여기서 welcome +500. 결국 모두 가입 시 정확히 +500.
-- 대기 플래그(localStorage) 방식 폐기 → 서버가 로그인 세션에서 멱등 지급하므로 유실·민원 원천 차단.
create or replace function public.claim_welcome_bonus()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_amt  int  := 500;
  v_bal  double precision;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;

  insert into point_balances(user_id) values (v_user) on conflict (user_id) do nothing;

  if exists (
    select 1 from point_ledger
    where user_id = v_user and reason in ('welcome', 'referral:join', 'tour_bonus')
  ) then
    select balance + paid_balance into v_bal from point_balances where user_id = v_user;
    return jsonb_build_object('ok', true, 'already', true, 'amount', 0, 'balance', round(v_bal));
  end if;

  update point_balances set balance = balance + v_amt, updated_at = now() where user_id = v_user;
  insert into point_ledger(user_id, delta, reason) values (v_user, v_amt, 'welcome');

  select balance + paid_balance into v_bal from point_balances where user_id = v_user;
  return jsonb_build_object('ok', true, 'already', false, 'amount', v_amt, 'balance', round(v_bal));
end $$;

grant execute on function public.claim_welcome_bonus() to authenticated;
