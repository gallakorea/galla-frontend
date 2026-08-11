-- =========================================================
-- 환불 악용 차단 — 특히 인앱결제(IAP) 우회
--
-- 막아야 하는 시나리오
--  ①【치명】IAP로 사고 웹에서 현금 환불
--      앱에서 ₩14,300 결제 → 애플이 30%(₩4,290) 가져감 → 우리 수령 ₩10,010.
--      여기서 우리가 현금 ₩14,300을 돌려주면 건당 ₩4,290 순손실.
--      게다가 애플에도 환불을 요청하면 유저는 두 번 돌려받는다(이중 환불).
--      → IAP 결제는 우리가 돈을 쥔 적이 없다. 환불도 스토어만 할 수 있다.
--         gc_refund_request 는 channel='web' 만 받는다. 클라 판별은 믿지 않고
--         gc_charges.channel(결제 시점에 서버가 박은 값)로 판정한다.
--
--  ②【치명】환불 신청해 놓고 GC를 다 써버리기
--      신청 시 "잠긴다"고 안내하지만 _gc_spend 는 홀드를 몰랐다.
--      → 신청 → 전액 소진 → 승인 시 회수 실패. 관리자가 수동으로 거절해야 했다.
--      → _gc_spend 가 홀드분을 빼고 계산하게 한다. 진짜로 잠근다.
--
--  ③ 스토어가 유저에게 환불해줬는데 우리 GC는 그대로 (클로백 미처리)
--      → gc_clawback: GC 회수 + 못 채운 만큼 부채로 기록 + 결제 차단 플래그.
--
--  ④ 충전↔환불 반복 (카드깡·자금세탁·결제수단 테스트)
--      → 30일 내 환불 건수/금액 상한 + 결제 직후 쿨다운.
-- =========================================================

-- ---------------------------------------------------------
-- 악용 플래그 / 클로백 부채
-- ---------------------------------------------------------
create table if not exists public.gc_clawbacks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,                 -- FK 없음: 탈퇴해도 기록 보존
  charge_id    uuid references public.gc_charges(id) on delete restrict,
  source       text not null check (source in ('apple','google','pg','admin')),
  gc           integer not null check (gc > 0),   -- 회수해야 할 GC
  recovered    integer not null default 0,        -- 실제로 회수한 GC
  shortfall    integer not null default 0,        -- 못 채운 GC(=부채)
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists gc_clawbacks_user_idx on public.gc_clawbacks(user_id, created_at desc);
alter table public.gc_clawbacks enable row level security;
drop policy if exists gc_clawbacks_admin on public.gc_clawbacks;
create policy gc_clawbacks_admin on public.gc_clawbacks for select using (_is_admin());

-- 결제 차단 플래그 (클로백 부채가 남았거나 관리자가 막은 유저)
create table if not exists public.gc_payment_blocks (
  user_id    uuid primary key,
  reason     text not null,
  created_at timestamptz not null default now()
);
alter table public.gc_payment_blocks enable row level security;
drop policy if exists gc_blocks_admin on public.gc_payment_blocks;
create policy gc_blocks_admin on public.gc_payment_blocks for select using (_is_admin());

-- ---------------------------------------------------------
-- ② 홀드 반영 — 환불 신청분은 진짜로 잠근다
--    _gc_spend 는 AI 창작·스티커·아이템·프레임이 모두 쓰는 공용 차감기다.
--    평상시 홀드는 0이라 동작이 달라지지 않는다.
--    ⚠️ admin_gc_refund_decide 의 회수는 홀드 자기 자신이므로 예외로 둔다
--       (안 그러면 승인이 자기 홀드에 막혀 영원히 회수 불가).
-- ---------------------------------------------------------
create or replace function public._gc_spend(p_user uuid, p_amt integer, p_reason text default 'spend')
returns double precision language plpgsql security definer set search_path to 'public' as $$
declare v_bal int; v_held int := 0;
begin
  if p_user is null or p_amt is null or p_amt <= 0 then return null; end if;
  insert into gc_balances(user_id) values (p_user) on conflict (user_id) do nothing;

  -- 환불 승인에 의한 회수는 홀드를 소진하는 행위다 → 홀드 검사 제외
  if coalesce(p_reason,'') <> 'gc:refund' then
    select coalesce(sum(gc),0)::int into v_held from gc_refunds
     where user_id = p_user and status in ('requested','approved');
  end if;

  -- 조건부 update — 잔액에서 홀드를 뺀 만큼만 쓸 수 있다
  update gc_balances set balance = balance - p_amt, updated_at = now()
    where user_id = p_user and balance - v_held >= p_amt
    returning balance into v_bal;
  if v_bal is null then return null; end if;

  insert into gc_ledger(user_id, delta, reason) values (p_user, -p_amt, p_reason);
  return v_bal;
end $$;

-- ---------------------------------------------------------
-- ①④ 환불 신청 — 채널 차단 + 속도 제한 + 차단 플래그
-- ---------------------------------------------------------
create or replace function public.gc_refund_request(p_charge_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_user uuid := auth.uid();
  c gc_charges%rowtype;
  v_bal int; v_held int; v_free int; v_gc int;
  v_cnt30 int; v_sum30 int; v_id uuid;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','auth'); end if;

  if exists (select 1 from gc_payment_blocks where user_id = v_user) then
    return jsonb_build_object('ok',false,'reason','blocked');
  end if;

  select * into c from gc_charges where id = p_charge_id and user_id = v_user;
  if c.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if c.status <> 'paid' then return jsonb_build_object('ok',false,'reason','not_paid'); end if;

  -- ① 인앱결제는 우리가 돈을 쥔 적이 없다. 스토어에서만 환불된다.
  --    클라가 보내는 채널은 믿지 않는다 — 결제 시점에 서버가 기록한 값으로 판정.
  if c.channel <> 'web' then
    return jsonb_build_object('ok',false,'reason','store_purchase','channel',c.channel);
  end if;

  if exists (select 1 from gc_refunds where charge_id = c.id and status in ('requested','approved')) then
    return jsonb_build_object('ok',false,'reason','already_requested');
  end if;
  if exists (select 1 from gc_refunds where charge_id = c.id and status = 'done') then
    return jsonb_build_object('ok',false,'reason','already_refunded');
  end if;

  -- ④ 반복 환불 제한 (카드깡·자금세탁·결제수단 테스트)
  select count(*), coalesce(sum(krw),0) into v_cnt30, v_sum30
    from gc_refunds
   where user_id = v_user and status in ('requested','approved','done')
     and created_at > now() - interval '30 days';
  if v_cnt30 >= 5 then
    return jsonb_build_object('ok',false,'reason','too_many_refunds','count',v_cnt30);
  end if;
  if v_sum30 >= 500000 then
    return jsonb_build_object('ok',false,'reason','refund_limit','sum',v_sum30);
  end if;

  select balance into v_bal from gc_balances where user_id = v_user for update;
  v_bal  := coalesce(v_bal,0);
  v_held := _gc_refund_held(v_user);
  v_free := greatest(v_bal - v_held, 0);
  v_gc   := least(c.gc, v_free);

  if v_gc <= 0 then
    return jsonb_build_object('ok',false,'reason','nothing_refundable','balance',v_bal,'held',v_held);
  end if;

  insert into gc_refunds(user_id, charge_id, gc, krw, reason)
  values (v_user, c.id, v_gc, v_gc, nullif(btrim(coalesce(p_reason,'')),''))
  returning id into v_id;

  return jsonb_build_object('ok',true,'id',v_id,'gc',v_gc,'krw',v_gc,
    'partial', v_gc < c.gc,
    'within_7d', c.paid_at > now() - interval '7 days');
end $$;

-- ---------------------------------------------------------
-- ③ 클로백 — 스토어/PG가 유저에게 환불해줬을 때 GC 회수
--    호출자: App Store Server Notification 핸들러(service_role) 또는 관리자.
--    잔액이 모자라면 있는 만큼 회수하고 나머지는 부채로 남긴 뒤 결제를 막는다.
--    (마이너스 잔액을 만들지 않는다 — 다른 로직이 전부 음수를 가정하지 않는다)
-- ---------------------------------------------------------
create or replace function public.gc_clawback(
  p_user uuid, p_charge_id uuid, p_source text, p_gc integer, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_bal int; v_take int; v_short int; v_id uuid;
begin
  if not ((select auth.role()) = 'service_role' or _is_admin()) then
    return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  if p_gc is null or p_gc <= 0 then return jsonb_build_object('ok',false,'reason','bad_amount'); end if;

  -- 같은 결제건을 두 번 회수하지 않는다(스토어 알림은 재전송된다)
  if p_charge_id is not null and exists (
       select 1 from gc_clawbacks where charge_id = p_charge_id and source = p_source) then
    return jsonb_build_object('ok',true,'already',true);
  end if;

  insert into gc_balances(user_id) values (p_user) on conflict (user_id) do nothing;
  select balance into v_bal from gc_balances where user_id = p_user for update;
  v_bal   := coalesce(v_bal,0);
  v_take  := least(v_bal, p_gc);
  v_short := p_gc - v_take;

  if v_take > 0 then
    update gc_balances set balance = balance - v_take, updated_at = now() where user_id = p_user;
    insert into gc_ledger(user_id, delta, reason, ref_id)
      values (p_user, -v_take, 'gc:clawback:' || p_source, p_charge_id);
  end if;

  insert into gc_clawbacks(user_id, charge_id, source, gc, recovered, shortfall, note)
  values (p_user, p_charge_id, p_source, p_gc, v_take, v_short, p_note)
  returning id into v_id;

  -- 결제 건 자체를 환불됨으로 표시 (내역·영수증에 그대로 드러난다)
  if p_charge_id is not null then
    update gc_charges set status = 'refunded' where id = p_charge_id and status = 'paid';
  end if;

  -- 이미 써버린 만큼은 부채 — 갚기 전까지 충전·환불을 막는다
  if v_short > 0 then
    insert into gc_payment_blocks(user_id, reason)
    values (p_user, '스토어 환불분 미회수 ' || v_short || ' GC')
    on conflict (user_id) do update set reason = excluded.reason;
  end if;

  return jsonb_build_object('ok',true,'id',v_id,'recovered',v_take,'shortfall',v_short,
                            'blocked', v_short > 0);
end $$;

-- ④ 충전도 차단 플래그를 본다
create or replace function public.gc_charge_begin(p_key text, p_channel text default 'web')
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  p gc_packages%rowtype;
  v_id uuid; v_ch text; v_base int; v_price int;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;

  if exists (select 1 from gc_payment_blocks where user_id = v_uid) then
    return jsonb_build_object('ok',false,'reason','blocked'); end if;

  select * into p from gc_packages where key = p_key and active;
  if p.key is null then return jsonb_build_object('ok',false,'reason','bad_package'); end if;

  v_ch := lower(coalesce(nullif(btrim(p_channel), ''), 'web'));
  if v_ch not in ('web','ios','android') then v_ch := 'web'; end if;
  v_base := p.krw;
  v_price := _charge_price(v_base, v_ch);

  insert into gc_charges(user_id, pkg, krw, gc, status, channel, fee)
    values (v_uid, p.key, v_price, v_base, 'pending', v_ch, v_price - v_base)
    returning id into v_id;

  return jsonb_build_object('ok',true,'charge_id',v_id,
    'krw',v_price, 'gc',v_base, 'base',v_base, 'markup',v_price - v_base, 'channel',v_ch);
end $$;

-- gc_charges.status 에 'refunded' 가 들어갈 수 있어야 한다
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'gc_charges_status_check') then
    alter table public.gc_charges drop constraint gc_charges_status_check;
  end if;
  alter table public.gc_charges
    add constraint gc_charges_status_check
    check (status in ('pending','paid','canceled','failed','refunded'));
end $$;

-- 관리자: 차단 해제
create or replace function public.admin_gc_unblock(p_user uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  delete from gc_payment_blocks where user_id = p_user;
  return jsonb_build_object('ok',true);
end $$;

-- 결제내역도 채널을 반영한다 — IAP 건에는 환불 버튼이 뜨면 안 된다
create or replace function public.gc_charge_history(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_user uuid := auth.uid();
  v_bal int; v_held int; v_free int; v_blocked boolean; v_rows jsonb;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','auth'); end if;

  select coalesce(balance,0) into v_bal from gc_balances where user_id = v_user;
  v_bal  := coalesce(v_bal,0);
  v_held := _gc_refund_held(v_user);
  v_free := greatest(v_bal - v_held, 0);
  v_blocked := exists (select 1 from gc_payment_blocks where user_id = v_user);

  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'id',          c.id,
      'pkg',         c.pkg,
      'krw',         c.krw,
      'gc',          c.gc,
      'status',      c.status,
      'channel',     c.channel,
      'pg_provider', c.pg_provider,
      'pg_tx_id',    c.pg_tx_id,
      'created_at',  c.created_at,
      'paid_at',     c.paid_at,
      'within_7d',   (c.paid_at is not null and c.paid_at > now() - interval '7 days'),
      -- 인앱결제(ios/android)는 우리가 돈을 쥔 적이 없다 → 우리 쪽 환불 가능액은 0.
      --   유저에게는 "스토어에서 환불 요청" 경로를 보여준다.
      'store_only',  (c.channel <> 'web'),
      'refundable',  case when c.status <> 'paid' or c.channel <> 'web' or v_blocked then 0
                          else least(c.gc, v_free) end,
      'refund',      (select jsonb_build_object('id',r.id,'status',r.status,'gc',r.gc,
                                                'krw',r.krw,'created_at',r.created_at,
                                                'admin_note',r.admin_note)
                        from gc_refunds r where r.charge_id = c.id
                       order by r.created_at desc limit 1)
    ) x
    from gc_charges c
    where c.user_id = v_user
    order by c.created_at desc
    limit greatest(1, least(coalesce(p_limit,50), 200))
  ) t;

  return jsonb_build_object('ok',true,'balance',v_bal,'held',v_held,
                            'refundable_total',v_free,'blocked',v_blocked,'charges',v_rows);
end $$;

-- gc_clawback 은 함수 안에서 service_role/관리자를 검사한다(관제센터에서도 써야 하므로 grant 유지)
grant execute on function public.gc_clawback(uuid, uuid, text, integer, text) to authenticated, service_role;
grant execute on function public.admin_gc_unblock(uuid, text) to authenticated;
grant execute on function public.gc_charge_history(integer) to authenticated;
