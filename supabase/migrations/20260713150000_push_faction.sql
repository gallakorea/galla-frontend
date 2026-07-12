-- ⚔️ 진영 밀어주기 — GP로 진영 전황에 힘싣기 (실제 GP 차감, 서버 검증)
create or replace function public.push_faction(p_issue_id bigint, p_stance text, p_amount int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_bal numeric; v_pro bigint; v_con bigint;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_stance not in ('pro','con') then return jsonb_build_object('ok',false,'reason','bad_stance'); end if;
  if p_amount is null or p_amount < 100 or p_amount > 1000000 then
    return jsonb_build_object('ok',false,'reason','bad_amount'); end if;
  insert into point_balances(user_id) values(v_uid) on conflict (user_id) do nothing;
  select balance into v_bal from point_balances where user_id=v_uid for update;
  if coalesce(v_bal,0) < p_amount then
    return jsonb_build_object('ok',false,'reason','insufficient','balance',coalesce(v_bal,0),'cost',p_amount); end if;
  update point_balances set balance = balance - p_amount where user_id=v_uid returning balance into v_bal;
  insert into point_ledger(user_id, delta, reason) values (v_uid, -p_amount, 'support:'||p_stance);
  insert into supports(issue_id, user_id, stance, side, amount)
    values (p_issue_id, v_uid, p_stance, p_stance, p_amount);
  select coalesce(sum(amount) filter (where stance='pro'),0),
         coalesce(sum(amount) filter (where stance='con'),0)
    into v_pro, v_con from supports where issue_id=p_issue_id;
  return jsonb_build_object('ok',true,'pro',v_pro,'con',v_con,'balance',v_bal);
end $$;

-- 이슈 전황(밀어주기 합계) 조회 — 공개
create or replace function public.issue_faction(p_issue_id bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok',true,
    'pro', coalesce((select sum(amount) from supports where issue_id=p_issue_id and stance='pro'),0),
    'con', coalesce((select sum(amount) from supports where issue_id=p_issue_id and stance='con'),0),
    'mine', coalesce((select sum(amount) from supports where issue_id=p_issue_id and user_id=auth.uid()),0));
$$;

grant execute on function public.push_faction(bigint,text,int) to authenticated;
grant execute on function public.issue_faction(bigint) to anon, authenticated;
