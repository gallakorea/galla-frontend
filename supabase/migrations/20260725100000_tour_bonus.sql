-- 🎪 온보딩 투어 완주 보너스 — 끝까지 보면 +500 GP(무료 지갑), 유저당 1회.
-- 건너뛰기 이탈 방지용 당근. 멱등: point_ledger reason='tour_bonus' 존재 시 재지급 안 함.
-- 미로그인으로 완주한 경우는 프론트가 pending 플래그를 두고, 로그인 직후 이 RPC를 호출한다.
create or replace function public.claim_tour_bonus()
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

  -- 이미 받은 사람 → 조용히 already
  if exists (select 1 from point_ledger where user_id = v_user and reason = 'tour_bonus') then
    select balance + paid_balance into v_bal from point_balances where user_id = v_user;
    return jsonb_build_object('ok', true, 'already', true, 'amount', 0, 'balance', round(v_bal));
  end if;

  update point_balances set balance = balance + v_amt, updated_at = now() where user_id = v_user;
  insert into point_ledger(user_id, delta, reason) values (v_user, v_amt, 'tour_bonus');

  select balance + paid_balance into v_bal from point_balances where user_id = v_user;
  return jsonb_build_object('ok', true, 'already', false, 'amount', v_amt, 'balance', round(v_bal));
end $$;

grant execute on function public.claim_tour_bonus() to authenticated;
