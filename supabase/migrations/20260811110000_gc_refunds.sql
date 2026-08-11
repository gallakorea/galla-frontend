-- =========================================================
-- 갈라페이 결제내역 · 영수증 · 환불 (전자상거래법/콘텐츠이용자보호지침 대응)
--
-- 법적 요구:
--   · 결제내역 조회 제공 (전자상거래법 §6)
--   · 청약철회: 미사용 콘텐츠는 결제일로부터 7일 내 철회 가능 (§17)
--   · 일부 사용 시 미사용분 환불
--   · 환불 신청 창구 제공
--
-- 우리 정책 (법정 최소보다 유리하게 — 유리하게 주는 건 문제되지 않는다):
--   · 7일 이내  : 청약철회. 미사용분 전액 환불, 위약금 없음.
--   · 7일 경과  : 잔여 GC 환불 신청 가능(관리자 심사).
--   · 환불 가능액 = min(해당 결제의 GC, 현재 잔액 - 이미 신청해 홀드된 GC)
--     → 이미 쓴 GC는 돌려주지 않는다. 여러 건 결제 시 이중 환불도 막힌다.
--
-- ⚠️ PG 미연동 상태다. 실제 송금은 관리자가 PG 콘솔에서 처리하고,
--    여기서는 GC 회수 + 상태 기록만 한다(마감 처리 = admin_gc_refund_decide).
-- =========================================================

create table if not exists public.gc_refunds (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  charge_id     uuid not null references public.gc_charges(id) on delete cascade,
  gc            integer not null check (gc > 0),   -- 환불 신청 GC (= 회수할 GC)
  krw           integer not null check (krw >= 0), -- 환급 예정 원화 (1GC=1원)
  reason        text,
  status        text not null default 'requested'
                check (status in ('requested','approved','rejected','done','canceled')),
  admin_note    text,
  processed_by  uuid references auth.users(id),
  processed_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists gc_refunds_user_idx   on public.gc_refunds(user_id, created_at desc);
create index if not exists gc_refunds_status_idx on public.gc_refunds(status, created_at);
-- 같은 결제건에 대해 살아있는 신청은 하나만 (거절/취소된 건 재신청 허용)
create unique index if not exists gc_refunds_open_uniq
  on public.gc_refunds(charge_id) where status in ('requested','approved');

alter table public.gc_refunds enable row level security;

drop policy if exists gc_refunds_own on public.gc_refunds;
create policy gc_refunds_own on public.gc_refunds
  for select using (user_id = auth.uid() or _is_admin());
-- INSERT는 정책으로 열지 않는다 — 반드시 gc_refund_request(SECURITY DEFINER)를 거쳐야
-- 7일/잔액/중복 가드를 통과한다.

grant select on public.gc_refunds to authenticated;

-- ---------------------------------------------------------
-- 홀드 중인(=아직 회수 안 끝난) 환불 신청 GC 합계
-- ---------------------------------------------------------
create or replace function public._gc_refund_held(p_user uuid)
returns integer language sql stable security definer set search_path to 'public' as $$
  select coalesce(sum(gc),0)::int from gc_refunds
   where user_id = p_user and status in ('requested','approved');
$$;

-- ---------------------------------------------------------
-- 결제내역 — 내 갈라페이 충전 목록 + 건별 환불 가능 여부
-- ---------------------------------------------------------
create or replace function public.gc_charge_history(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_user uuid := auth.uid();
  v_bal  int;
  v_held int;
  v_free int;   -- 지금 환불에 쓸 수 있는 잔액(홀드 제외)
  v_rows jsonb;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','auth'); end if;

  select coalesce(balance,0) into v_bal from gc_balances where user_id = v_user;
  v_bal  := coalesce(v_bal,0);
  v_held := _gc_refund_held(v_user);
  v_free := greatest(v_bal - v_held, 0);

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
      -- 이 결제건으로 지금 환불받을 수 있는 최대 GC
      'refundable',  case when c.status <> 'paid' then 0
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
                            'refundable_total',v_free,'charges',v_rows);
end $$;

-- ---------------------------------------------------------
-- 영수증 — 결제 1건 상세 (거래명세)
-- ---------------------------------------------------------
create or replace function public.gc_receipt(p_charge_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); c gc_charges%rowtype; r gc_refunds%rowtype;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  select * into c from gc_charges where id = p_charge_id;
  if c.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if c.user_id <> v_user and not _is_admin() then
    return jsonb_build_object('ok',false,'reason','forbidden'); end if;

  select * into r from gc_refunds where charge_id = c.id order by created_at desc limit 1;

  return jsonb_build_object(
    'ok',true,
    'receipt_no',  'GP-' || to_char(c.created_at,'YYYYMMDD') || '-' || upper(right(c.id::text,6)),
    'id',          c.id,
    'status',      c.status,
    'pkg',         c.pkg,
    'gc',          c.gc,
    'krw',         c.krw,
    'channel',     c.channel,
    'pg_provider', c.pg_provider,
    'pg_tx_id',    c.pg_tx_id,
    'created_at',  c.created_at,
    'paid_at',     c.paid_at,
    'refund',      case when r.id is null then null else jsonb_build_object(
                     'id',r.id,'status',r.status,'gc',r.gc,'krw',r.krw,
                     'reason',r.reason,'admin_note',r.admin_note,
                     'created_at',r.created_at,'processed_at',r.processed_at) end
  );
end $$;

-- ---------------------------------------------------------
-- 환불 신청 — 유저
-- ---------------------------------------------------------
create or replace function public.gc_refund_request(p_charge_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_user uuid := auth.uid();
  c gc_charges%rowtype;
  v_bal int; v_held int; v_free int; v_gc int;
  v_id uuid;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','auth'); end if;

  select * into c from gc_charges where id = p_charge_id and user_id = v_user;
  if c.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if c.status <> 'paid' then return jsonb_build_object('ok',false,'reason','not_paid'); end if;

  if exists (select 1 from gc_refunds
              where charge_id = c.id and status in ('requested','approved')) then
    return jsonb_build_object('ok',false,'reason','already_requested');
  end if;
  if exists (select 1 from gc_refunds where charge_id = c.id and status = 'done') then
    return jsonb_build_object('ok',false,'reason','already_refunded');
  end if;

  -- 잔액 잠금 — 신청과 동시에 잔액이 빠져나가면 회수할 GC가 없어진다
  select balance into v_bal from gc_balances where user_id = v_user for update;
  v_bal  := coalesce(v_bal,0);
  v_held := _gc_refund_held(v_user);
  v_free := greatest(v_bal - v_held, 0);
  v_gc   := least(c.gc, v_free);

  if v_gc <= 0 then
    return jsonb_build_object('ok',false,'reason','nothing_refundable',
      'balance',v_bal,'held',v_held);
  end if;

  insert into gc_refunds(user_id, charge_id, gc, krw, reason)
  values (v_user, c.id, v_gc, v_gc, nullif(btrim(coalesce(p_reason,'')),''))
  returning id into v_id;

  return jsonb_build_object('ok',true,'id',v_id,'gc',v_gc,'krw',v_gc,
    'partial', v_gc < c.gc,
    'within_7d', c.paid_at > now() - interval '7 days');
end $$;

-- 신청 취소 (관리자 처리 전까지)
create or replace function public.gc_refund_cancel(p_refund_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); n int;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  update gc_refunds set status='canceled', processed_at=now()
   where id = p_refund_id and user_id = v_user and status = 'requested';
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok',false,'reason','not_cancelable'); end if;
  return jsonb_build_object('ok',true);
end $$;

-- ---------------------------------------------------------
-- 관리자 — 환불 목록 / 처리
-- ---------------------------------------------------------
create or replace function public.admin_gc_refunds(p_status text default 'requested', p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  return jsonb_build_object('ok',true,'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',r.id,'user_id',r.user_id,'nickname',u.nickname,
      'charge_id',r.charge_id,'gc',r.gc,'krw',r.krw,'reason',r.reason,
      'status',r.status,'admin_note',r.admin_note,
      'created_at',r.created_at,'processed_at',r.processed_at,
      'charge', jsonb_build_object('krw',c.krw,'gc',c.gc,'paid_at',c.paid_at,
                                   'pg_provider',c.pg_provider,'pg_tx_id',c.pg_tx_id,
                                   'within_7d', c.paid_at > now() - interval '7 days'),
      'balance', coalesce((select balance from gc_balances b where b.user_id=r.user_id),0)
    ) order by r.created_at)
    from gc_refunds r
    join gc_charges c on c.id = r.charge_id
    left join users u on u.id = r.user_id
    where (p_status is null or p_status='all' or r.status = p_status)
    limit greatest(1, least(coalesce(p_limit,100), 500))
  ), '[]'::jsonb));
end $$;

/* 승인(approve) = GC를 실제로 회수한다. 실제 원화 환급은 PG 콘솔에서 관리자가 처리하고,
   송금까지 끝나면 done으로 마감한다. 회수는 승인 시점에 한 번만 일어난다. */
create or replace function public.admin_gc_refund_decide(
  p_refund_id uuid, p_action text, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r gc_refunds%rowtype; v_bal int;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  if p_action not in ('approve','reject','done') then
    return jsonb_build_object('ok',false,'reason','bad_action'); end if;

  select * into r from gc_refunds where id = p_refund_id for update;
  if r.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;

  if p_action = 'reject' then
    if r.status <> 'requested' then return jsonb_build_object('ok',false,'reason','not_pending'); end if;
    update gc_refunds set status='rejected', admin_note=p_note,
           processed_by=auth.uid(), processed_at=now() where id=r.id;
    return jsonb_build_object('ok',true,'status','rejected');
  end if;

  if p_action = 'approve' then
    if r.status <> 'requested' then return jsonb_build_object('ok',false,'reason','not_pending'); end if;
    -- 잔액이 모자라면 _gc_spend가 null을 돌려준다 → 승인 불가(빚을 지우지 않는다)
    v_bal := _gc_spend(r.user_id, r.gc, 'gc:refund');
    if v_bal is null then
      return jsonb_build_object('ok',false,'reason','insufficient_balance',
        'balance', coalesce((select balance from gc_balances where user_id=r.user_id),0));
    end if;
    update gc_refunds set status='approved', admin_note=p_note,
           processed_by=auth.uid(), processed_at=now() where id=r.id;
    return jsonb_build_object('ok',true,'status','approved','balance',v_bal,
      'todo','PG 콘솔에서 ₩'||r.krw||' 환급 후 done 처리');
  end if;

  -- done: 실제 송금 완료 마감
  if r.status <> 'approved' then return jsonb_build_object('ok',false,'reason','not_approved'); end if;
  update gc_refunds set status='done', admin_note=coalesce(p_note, r.admin_note),
         processed_by=auth.uid(), processed_at=now() where id=r.id;
  return jsonb_build_object('ok',true,'status','done');
end $$;

revoke execute on function public._gc_refund_held(uuid) from anon, authenticated, public;

grant execute on function public.gc_charge_history(integer)          to authenticated;
grant execute on function public.gc_receipt(uuid)                    to authenticated;
grant execute on function public.gc_refund_request(uuid, text)       to authenticated;
grant execute on function public.gc_refund_cancel(uuid)              to authenticated;
grant execute on function public.admin_gc_refunds(text, integer)     to authenticated;
grant execute on function public.admin_gc_refund_decide(uuid, text, text) to authenticated;
