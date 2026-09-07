-- 💸 gc_refund_settle — 환불 1건을 '실제 환급 완료'로 확정한다.
--
-- 왜 필요한가: admin_gc_refund_decide 의 approve 는 지금까지 이렇게 끝났다.
--     'todo', 'PG 콘솔에서 ₩'||r.krw||' 환급 후 done 처리'
--   즉 설계 자체가 "사람이 포트원 콘솔을 열어 손으로 취소" 였다. 그래서 환불 창구는
--   있는데 돈은 자동으로 안 돌아갔다(실측 2026-09-07: 취소 API 를 부르는 코드가 0곳).
--   이제 엣지 함수 gc-refund 가 포트원 취소를 실행한 **뒤에** 이 함수로 장부를 닫는다.
--
-- 호출자는 service_role(엣지 함수)뿐이다.
--   ⚠️ SECURITY DEFINER 안에서 current_user 로 권한을 판별하면 안 된다 — 소유자로 평가돼
--      구멍이 된다. 대신 EXECUTE 권한 자체를 회수해 막는다.
create or replace function public.gc_refund_settle(p_refund_id uuid, p_pg_ref text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r gc_refunds%rowtype; v_held int;
begin
  select * into r from gc_refunds where id = p_refund_id for update;
  if r.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;

  -- 멱등: 이미 닫힌 건을 다시 불러도 안전해야 한다(엣지 재시도·웹훅 중복).
  if r.status = 'done' then
    return jsonb_build_object('ok',true,'already',true,'gc',r.gc,'krw',r.krw); end if;
  if r.status not in ('requested','approved') then
    return jsonb_build_object('ok',false,'reason','bad_status','status',r.status); end if;

  -- 'requested' 면 잠긴 GC 가 아직 held 에 남아 있다 → 여기서 소멸시킨다.
  -- 'approved' 면 admin_gc_refund_decide 가 이미 소멸시켰으므로 건드리지 않는다(이중 차감 방지).
  if r.status = 'requested' then
    select held into v_held from gc_balances where user_id = r.user_id for update;
    if coalesce(v_held,0) < r.gc then
      return jsonb_build_object('ok',false,'reason','hold_missing','held',coalesce(v_held,0)); end if;
    update gc_balances set held = held - r.gc, updated_at = now() where user_id = r.user_id;
  end if;

  update gc_charges set status = 'refunded' where id = r.charge_id and status = 'paid';

  update gc_refunds
     set status = 'done',
         processed_at = now(),
         admin_note = coalesce(admin_note,'')
                      || case when p_pg_ref is null then '' else ' [pg:'||p_pg_ref||']' end
   where id = r.id;

  return jsonb_build_object('ok',true,'status','done','gc',r.gc,'krw',r.krw);
end $function$;

revoke all on function public.gc_refund_settle(uuid, text) from public;
revoke all on function public.gc_refund_settle(uuid, text) from anon;
revoke all on function public.gc_refund_settle(uuid, text) from authenticated;
