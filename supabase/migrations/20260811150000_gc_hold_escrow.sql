-- =========================================================
-- 환불 홀드를 에스크로로 — 잠긴 GC를 잔액에서 물리적으로 빼낸다
--
-- 20260811140000 에서는 _gc_spend 안에서 홀드를 빼는 방식으로 막았다. 반쪽이었다:
--   ai_creation_charge / gc_donate / gc_donate_post / gc_donate_plaza / gc_donate_live
--   다섯 함수는 _gc_spend 를 거치지 않고 gc_balances 를 직접 깎는다.
--   → 환불 신청으로 "잠겼다"고 안내해 놓고 AI 창작·후원으로는 전액 사용 가능했다.
--
-- 차감기마다 홀드를 기억하게 하는 설계는 새 차감기가 생길 때마다 또 뚫린다.
-- 그래서 구조로 바꾼다: 신청 시 balance → held 로 옮긴다.
--   그러면 기존 `balance >= X` 검사가 전부 자동으로 홀드를 존중한다.
--
--   신청  : balance -= gc,  held += gc
--   승인  : held    -= gc            (돈이 나갔다)
--   거절  : held    -= gc, balance += gc
--   취소  : held    -= gc, balance += gc
--
-- ⚠️ gc_balances 는 테이블 레벨 grant 다(컬럼 잠금 아님) — 컬럼 추가로 42501 나지 않는다.
--    확인함: information_schema.role_table_grants 에 anon/authenticated SELECT 존재.
-- =========================================================

alter table public.gc_balances
  add column if not exists held integer not null default 0 check (held >= 0);

comment on column public.gc_balances.held is
  '환불 신청으로 잠긴 GC(에스크로). balance 에서 빠져 있으므로 어떤 차감기로도 쓸 수 없다.';

-- 표시용. 이제 held 는 컬럼에서 바로 읽는다(신청 테이블 합산 아님).
create or replace function public._gc_refund_held(p_user uuid)
returns integer language sql stable security definer set search_path to 'public' as $$
  select coalesce((select held from gc_balances where user_id = p_user), 0)::int;
$$;

-- _gc_spend 는 원래대로. 홀드가 balance 밖에 있으니 따로 뺄 게 없다.
create or replace function public._gc_spend(p_user uuid, p_amt integer, p_reason text default 'spend')
returns double precision language plpgsql security definer set search_path to 'public' as $$
declare v_bal int;
begin
  if p_user is null or p_amt is null or p_amt <= 0 then return null; end if;
  insert into gc_balances(user_id) values (p_user) on conflict (user_id) do nothing;
  update gc_balances set balance = balance - p_amt, updated_at = now()
    where user_id = p_user and balance >= p_amt
    returning balance into v_bal;
  if v_bal is null then return null; end if;
  insert into gc_ledger(user_id, delta, reason) values (p_user, -p_amt, p_reason);
  return v_bal;
end $$;

-- ---------------------------------------------------------
-- 신청: balance → held
-- ---------------------------------------------------------
create or replace function public.gc_refund_request(p_charge_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_user uuid := auth.uid();
  c gc_charges%rowtype;
  v_bal int; v_gc int; v_cnt30 int; v_sum30 int; v_id uuid;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  if exists (select 1 from gc_payment_blocks where user_id = v_user) then
    return jsonb_build_object('ok',false,'reason','blocked'); end if;

  select * into c from gc_charges where id = p_charge_id and user_id = v_user;
  if c.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if c.status <> 'paid' then return jsonb_build_object('ok',false,'reason','not_paid'); end if;

  -- 인앱결제는 우리가 돈을 쥔 적이 없다 → 스토어에서만 환불된다
  if c.channel <> 'web' then
    return jsonb_build_object('ok',false,'reason','store_purchase','channel',c.channel); end if;

  if exists (select 1 from gc_refunds where charge_id = c.id and status in ('requested','approved')) then
    return jsonb_build_object('ok',false,'reason','already_requested'); end if;
  if exists (select 1 from gc_refunds where charge_id = c.id and status = 'done') then
    return jsonb_build_object('ok',false,'reason','already_refunded'); end if;

  select count(*), coalesce(sum(krw),0) into v_cnt30, v_sum30
    from gc_refunds
   where user_id = v_user and status in ('requested','approved','done')
     and created_at > now() - interval '30 days';
  if v_cnt30 >= 5      then return jsonb_build_object('ok',false,'reason','too_many_refunds','count',v_cnt30); end if;
  if v_sum30 >= 500000 then return jsonb_build_object('ok',false,'reason','refund_limit','sum',v_sum30); end if;

  insert into gc_balances(user_id) values (v_user) on conflict (user_id) do nothing;
  select balance into v_bal from gc_balances where user_id = v_user for update;
  v_bal := coalesce(v_bal,0);
  v_gc  := least(c.gc, v_bal);   -- held 는 이미 balance 밖이라 따로 뺄 필요가 없다
  if v_gc <= 0 then
    return jsonb_build_object('ok',false,'reason','nothing_refundable','balance',v_bal); end if;

  -- 여기서 진짜로 잠근다 — 이 순간부터 어떤 차감기로도 쓸 수 없다
  update gc_balances set balance = balance - v_gc, held = held + v_gc, updated_at = now()
   where user_id = v_user;
  insert into gc_ledger(user_id, delta, reason, ref_id) values (v_user, -v_gc, 'gc:refund_hold', c.id);

  insert into gc_refunds(user_id, charge_id, gc, krw, reason)
  values (v_user, c.id, v_gc, v_gc, nullif(btrim(coalesce(p_reason,'')),''))
  returning id into v_id;

  return jsonb_build_object('ok',true,'id',v_id,'gc',v_gc,'krw',v_gc,
    'partial', v_gc < c.gc, 'within_7d', c.paid_at > now() - interval '7 days');
end $$;

-- ---------------------------------------------------------
-- 취소: held → balance 복구
-- ---------------------------------------------------------
create or replace function public.gc_refund_cancel(p_refund_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r gc_refunds%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  select * into r from gc_refunds
   where id = p_refund_id and user_id = auth.uid() and status = 'requested' for update;
  if r.id is null then return jsonb_build_object('ok',false,'reason','not_cancelable'); end if;

  update gc_balances set held = held - r.gc, balance = balance + r.gc, updated_at = now()
   where user_id = r.user_id;
  insert into gc_ledger(user_id, delta, reason, ref_id)
    values (r.user_id, r.gc, 'gc:refund_unhold', r.charge_id);
  update gc_refunds set status='canceled', processed_at=now() where id = r.id;
  return jsonb_build_object('ok',true);
end $$;

-- ---------------------------------------------------------
-- 관리자 처리: 승인=held 소멸 / 거절=held 복구
-- ---------------------------------------------------------
create or replace function public.admin_gc_refund_decide(
  p_refund_id uuid, p_action text, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r gc_refunds%rowtype; v_held int;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  if p_action not in ('approve','reject','done') then
    return jsonb_build_object('ok',false,'reason','bad_action'); end if;

  select * into r from gc_refunds where id = p_refund_id for update;
  if r.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;

  if p_action = 'reject' then
    if r.status <> 'requested' then return jsonb_build_object('ok',false,'reason','not_pending'); end if;
    update gc_balances set held = held - r.gc, balance = balance + r.gc, updated_at = now()
     where user_id = r.user_id;
    insert into gc_ledger(user_id, delta, reason, ref_id)
      values (r.user_id, r.gc, 'gc:refund_unhold', r.charge_id);
    update gc_refunds set status='rejected', admin_note=p_note,
           processed_by=auth.uid(), processed_at=now() where id=r.id;
    return jsonb_build_object('ok',true,'status','rejected');
  end if;

  if p_action = 'approve' then
    if r.status <> 'requested' then return jsonb_build_object('ok',false,'reason','not_pending'); end if;
    -- 잠긴 GC를 소멸시킨다. 신청 시점에 이미 balance 에서 빠졌으므로 잔액 부족이 있을 수 없다.
    select held into v_held from gc_balances where user_id = r.user_id for update;
    if coalesce(v_held,0) < r.gc then
      return jsonb_build_object('ok',false,'reason','hold_missing','held',coalesce(v_held,0)); end if;
    update gc_balances set held = held - r.gc, updated_at = now() where user_id = r.user_id;
    update gc_refunds set status='approved', admin_note=p_note,
           processed_by=auth.uid(), processed_at=now() where id=r.id;
    update gc_charges set status='refunded' where id = r.charge_id and status='paid';
    return jsonb_build_object('ok',true,'status','approved',
      'todo','PG 콘솔에서 ₩'||r.krw||' 환급 후 done 처리');
  end if;

  if r.status <> 'approved' then return jsonb_build_object('ok',false,'reason','not_approved'); end if;
  update gc_refunds set status='done', admin_note=coalesce(p_note, r.admin_note),
         processed_by=auth.uid(), processed_at=now() where id=r.id;
  return jsonb_build_object('ok',true,'status','done');
end $$;

-- ---------------------------------------------------------
-- 클로백: 잔액 → 홀드 순으로 회수 (환불 신청 중에 스토어 환불이 겹칠 수 있다)
-- ---------------------------------------------------------
create or replace function public.gc_clawback(
  p_user uuid, p_charge_id uuid, p_source text, p_gc integer, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_bal int; v_held int; v_take int; v_from_held int; v_short int; v_id uuid;
begin
  if not ((select auth.role()) = 'service_role' or _is_admin()) then
    return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  if p_gc is null or p_gc <= 0 then return jsonb_build_object('ok',false,'reason','bad_amount'); end if;

  if p_charge_id is not null and exists (
       select 1 from gc_clawbacks where charge_id = p_charge_id and source = p_source) then
    return jsonb_build_object('ok',true,'already',true);
  end if;

  insert into gc_balances(user_id) values (p_user) on conflict (user_id) do nothing;
  select balance, held into v_bal, v_held from gc_balances where user_id = p_user for update;
  v_bal := coalesce(v_bal,0); v_held := coalesce(v_held,0);

  v_take      := least(v_bal, p_gc);                       -- 먼저 자유 잔액에서
  v_from_held := least(v_held, p_gc - v_take);             -- 모자라면 잠긴 것도 회수
  v_short     := p_gc - v_take - v_from_held;

  if v_take > 0 or v_from_held > 0 then
    update gc_balances set balance = balance - v_take, held = held - v_from_held, updated_at = now()
     where user_id = p_user;
    insert into gc_ledger(user_id, delta, reason, ref_id)
      values (p_user, -(v_take + v_from_held), 'gc:clawback:' || p_source, p_charge_id);
  end if;

  -- 잠긴 GC를 가져갔다면 그 환불 신청은 더 이상 지급할 수 없다
  if v_from_held > 0 and p_charge_id is not null then
    update gc_refunds set status='canceled', admin_note='스토어 환불로 회수됨', processed_at=now()
     where charge_id = p_charge_id and status in ('requested','approved');
  end if;

  insert into gc_clawbacks(user_id, charge_id, source, gc, recovered, shortfall, note)
  values (p_user, p_charge_id, p_source, p_gc, v_take + v_from_held, v_short, p_note)
  returning id into v_id;

  if p_charge_id is not null then
    update gc_charges set status = 'refunded' where id = p_charge_id and status = 'paid';
  end if;

  if v_short > 0 then
    insert into gc_payment_blocks(user_id, reason)
    values (p_user, '스토어 환불분 미회수 ' || v_short || ' GC')
    on conflict (user_id) do update set reason = excluded.reason;
  end if;

  return jsonb_build_object('ok',true,'id',v_id,'recovered',v_take + v_from_held,
                            'from_held',v_from_held,'shortfall',v_short,'blocked', v_short > 0);
end $$;

-- ---------------------------------------------------------
-- 조회: held 는 컬럼에서, refundable 은 자유 잔액에서
-- ---------------------------------------------------------
create or replace function public.gc_charge_history(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_user uuid := auth.uid();
  v_bal int; v_held int; v_blocked boolean; v_rows jsonb;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','auth'); end if;

  select coalesce(balance,0), coalesce(held,0) into v_bal, v_held
    from gc_balances where user_id = v_user;
  v_bal := coalesce(v_bal,0); v_held := coalesce(v_held,0);
  v_blocked := exists (select 1 from gc_payment_blocks where user_id = v_user);

  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'id',c.id, 'pkg',c.pkg, 'krw',c.krw, 'gc',c.gc, 'status',c.status, 'channel',c.channel,
      'pg_provider',c.pg_provider, 'pg_tx_id',c.pg_tx_id,
      'created_at',c.created_at, 'paid_at',c.paid_at,
      'within_7d', (c.paid_at is not null and c.paid_at > now() - interval '7 days'),
      'store_only', (c.channel <> 'web'),
      'refundable', case when c.status <> 'paid' or c.channel <> 'web' or v_blocked then 0
                         else least(c.gc, v_bal) end,
      'refund', (select jsonb_build_object('id',r.id,'status',r.status,'gc',r.gc,'krw',r.krw,
                                           'created_at',r.created_at,'admin_note',r.admin_note)
                   from gc_refunds r where r.charge_id = c.id
                  order by r.created_at desc limit 1)
    ) x
    from gc_charges c where c.user_id = v_user
    order by c.created_at desc
    limit greatest(1, least(coalesce(p_limit,50), 200))
  ) t;

  return jsonb_build_object('ok',true,'balance',v_bal,'held',v_held,
                            'refundable_total',v_bal,'blocked',v_blocked,'charges',v_rows);
end $$;

grant execute on function public.gc_charge_history(integer)   to authenticated;
grant execute on function public.gc_refund_request(uuid,text) to authenticated;
grant execute on function public.gc_refund_cancel(uuid)       to authenticated;
