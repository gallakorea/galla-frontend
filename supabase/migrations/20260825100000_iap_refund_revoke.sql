-- =========================================================
-- 스토어 환불 회수 — 지금은 환불이 들어와도 GC가 그대로 남는다
--
-- 구멍: grant_gc_topup 은 지급만 하고, 되돌리는 함수가 없다.
--       애플·구글에서 환불이 승인되면 스토어는 우리에게 돈을 돌려받아 가는데
--       유저 지갑의 GC는 그대로다. 사서 쓰고 환불받으면 공짜가 된다.
--       ⚠️ 이건 이론이 아니라 인앱결제에서 가장 흔한 실제 손실 경로다.
--
-- 원칙
--   ① 잔액을 마이너스로 만들지 않는다. 이미 써버린 만큼은 못 뺏는다.
--   ② 못 뺀 만큼(shortfall)이 있으면 그 계정의 결제를 막는다.
--      grant_gc_topup 이 이미 gc_payment_blocks 를 보고 거절한다 — 그 표를 재사용한다.
--   ③ 이미 후원으로 나가 크리에이터에게 배분된 GC는 회수하지 않는다.
--      남의 정산을 소급해서 깎으면 그게 더 큰 사고다. 플랫폼이 떠안고 기록만 남긴다.
-- =========================================================

-- 'refunded' 를 별도 상태로 둔다 — 'canceled'(결제 자체가 안 된 것)와 섞으면
-- 나중에 스토어 정산서와 대사할 때 어느 쪽인지 구분이 안 된다.
alter table public.gc_charges drop constraint if exists gc_charges_status_check;
alter table public.gc_charges add constraint gc_charges_status_check
  check (status in ('pending','paid','failed','canceled','refunded'));

alter table public.gc_charges add column if not exists refunded_at    timestamptz;
alter table public.gc_charges add column if not exists refund_reason  text;
alter table public.gc_charges add column if not exists recovered_gc   integer;

create or replace function public.revoke_gc_topup(
  p_store text, p_txid text, p_reason text default 'store_refund')
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_c record; v_bal int; v_take int; v_short int;
begin
  if not ((select auth.role()) = 'service_role' or _is_admin()) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if coalesce(btrim(p_txid), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_txid');
  end if;

  select id, user_id, gc, status into v_c
    from gc_charges
   where pg_provider = lower(p_store) and pg_tx_id = btrim(p_txid)
   limit 1;

  -- 모르는 거래에 대한 환불 통보도 온다(다른 앱·테스트·이미 지운 계정).
  -- 그건 오류가 아니라 '해당 없음'이다 — 200으로 돌려보내야 스토어가 재시도를 멈춘다.
  if not found then return jsonb_build_object('ok', true, 'unknown', true); end if;
  if v_c.status = 'refunded' then
    return jsonb_build_object('ok', true, 'dup', true, 'charge_id', v_c.id);
  end if;

  -- ① 있는 만큼만 회수 (음수 금지)
  select coalesce(balance, 0) into v_bal from gc_balances where user_id = v_c.user_id;
  v_take  := least(v_c.gc, greatest(coalesce(v_bal, 0), 0));
  v_short := v_c.gc - v_take;

  if v_take > 0 then
    update gc_balances set balance = balance - v_take, updated_at = now()
     where user_id = v_c.user_id;
    insert into gc_ledger(user_id, delta, reason, ref_id)
    values (v_c.user_id, -v_take, 'gc:refund', v_c.id);
  end if;

  update gc_charges
     set status = 'refunded', refunded_at = now(),
         refund_reason = left(coalesce(p_reason, 'store_refund'), 200),
         recovered_gc = v_take
   where id = v_c.id;

  -- ② 다 못 뺐으면 그 계정의 재결제를 막는다. 푸는 건 관리자 판단.
  if v_short > 0 then
    insert into gc_payment_blocks(user_id, reason)
    values (v_c.user_id, 'refund_shortfall:' || v_short || 'GC (' || lower(p_store) || ')')
    on conflict (user_id) do nothing;
  end if;

  return jsonb_build_object('ok', true, 'charge_id', v_c.id, 'user_id', v_c.user_id,
    'billed_gc', v_c.gc, 'recovered', v_take, 'shortfall', v_short, 'blocked', (v_short > 0));
end $fn$;

revoke all on function public.revoke_gc_topup(text, text, text) from public, anon, authenticated;
grant execute on function public.revoke_gc_topup(text, text, text) to service_role;

comment on function public.revoke_gc_topup(text, text, text) is
  '스토어 환불 통보 시 GC 회수. 잔액은 0 밑으로 내리지 않고, 못 뺀 만큼은 결제 차단으로 대신한다. store-notify 엣지 함수 전용.';

-- 관제용 — 환불이 얼마나, 누구에게서 나는지 안 보면 손실을 늦게 안다
create or replace function public.admin_refund_stats(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare v_since timestamptz := now() - make_interval(days => greatest(1, coalesce(p_days, 30)));
begin
  if not _is_admin() then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  return jsonb_build_object('ok', true, 'days', p_days,
    'by_channel', coalesce((
      select jsonb_agg(x) from (
        select channel,
               count(*) filter (where status = 'refunded')            as refunds,
               coalesce(sum(gc) filter (where status = 'refunded'), 0) as refunded_gc,
               coalesce(sum(recovered_gc), 0)                         as recovered_gc,
               coalesce(sum(gc - coalesce(recovered_gc, 0))
                        filter (where status = 'refunded'), 0)        as lost_gc,
               count(*) filter (where status = 'paid')                as paid
          from gc_charges where created_at >= v_since group by channel
      ) x), '[]'::jsonb),
    'blocked_accounts', (select count(*) from gc_payment_blocks));
end $fn$;
grant execute on function public.admin_refund_stats(integer) to authenticated;
