-- 🪙 갈라코인(GC) 지갑 — 크리에이터 후원 전용 현금성 재화 (PG 연결 직전 상태)
--
-- ★ 화폐 방화벽 불변식 (docs/currency-policy.md 정본):
--  1. GP↔GC 상호 전환 불가 (어느 방향의 RPC도 만들지 않는다)
--  2. GC는 현금(PG) 구매 외 발행 금지 — 보너스·이벤트 지급 절대 금지 (1코인=1원)
--  3. 출금(withdrawals) 재원은 후원 수익(donations.net)만 — GC 후원은 donations 행으로 귀결
--  4. GC 사용처는 후원뿐 — 아이템·예측·게임에 GC를 받는 RPC를 만들지 않는다
--  5. GC 유저 간 직접 이전 금지 (후원 경유만)

create table if not exists public.gc_balances (
  user_id uuid primary key,
  balance int not null default 0 check (balance >= 0),   -- 1 GC = 1 KRW, 정수
  updated_at timestamptz not null default now()
);
alter table public.gc_balances enable row level security;
drop policy if exists gc_balances_own on public.gc_balances;
create policy gc_balances_own on public.gc_balances for select
  using (user_id = auth.uid() or _is_admin());

create table if not exists public.gc_ledger (
  id bigserial primary key,
  user_id uuid not null,
  delta int not null,
  reason text not null,          -- 'gc:charge' | 'gc:donate'
  ref_id uuid,                   -- gc_charges.id 또는 donations.id
  created_at timestamptz not null default now()
);
create index if not exists idx_gc_ledger_user on public.gc_ledger(user_id, created_at desc);
alter table public.gc_ledger enable row level security;
drop policy if exists gc_ledger_own on public.gc_ledger;
create policy gc_ledger_own on public.gc_ledger for select
  using (user_id = auth.uid() or _is_admin());

-- 충전 패키지 (보너스 없음 — 불변식 2)
create table if not exists public.gc_packages (
  key text primary key, krw int not null, gc int not null,
  label text, sort int not null default 0, active boolean not null default true
);
insert into public.gc_packages(key,krw,gc,label,sort) values
  ('c1',  1000,  1000,  null, 1),
  ('c5',  5000,  5000,  null, 2),
  ('c10', 10000, 10000, null, 3),
  ('c30', 30000, 30000, null, 4),
  ('c50', 50000, 50000, null, 5),
  ('c100',100000,100000,null, 6)
on conflict (key) do update set krw=excluded.krw, gc=excluded.gc, sort=excluded.sort;
alter table public.gc_packages enable row level security;
drop policy if exists gc_packages_read on public.gc_packages;
create policy gc_packages_read on public.gc_packages for select using (true);

create table if not exists public.gc_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  pkg text, krw int not null, gc int not null,
  status text not null default 'pending' check (status in ('pending','paid','failed','canceled')),
  pg_provider text, pg_tx_id text,
  created_at timestamptz not null default now(), paid_at timestamptz
);
alter table public.gc_charges enable row level security;
drop policy if exists gc_charges_own on public.gc_charges;
create policy gc_charges_own on public.gc_charges for select
  using (user_id = auth.uid() or _is_admin());

-- donations에 결제수단 표기 (건별 PG='pg' / GC 지갑='gc')
alter table public.donations add column if not exists method text not null default 'pg';

create or replace function public.gc_balance()
returns int language plpgsql stable security definer set search_path = public as $$
declare v int;
begin
  if auth.uid() is null then return null; end if;
  select balance into v from gc_balances where user_id = auth.uid();
  return coalesce(v, 0);
end $$;

create or replace function public.gc_charge_packages()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok',true,'packages',
    coalesce((select jsonb_agg(jsonb_build_object('key',key,'krw',krw,'gc',gc,'label',label) order by sort)
      from gc_packages where active), '[]'::jsonb));
$$;

-- 충전 시작(pending) — PG가 결제, gc_charge_confirm으로 발행
create or replace function public.gc_charge_begin(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); p gc_packages%rowtype; v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select * into p from gc_packages where key=p_key and active;
  if p.key is null then return jsonb_build_object('ok',false,'reason','bad_package'); end if;
  insert into gc_charges(user_id,pkg,krw,gc,status) values (v_uid,p.key,p.krw,p.gc,'pending') returning id into v_id;
  return jsonb_build_object('ok',true,'charge_id',v_id,'krw',p.krw,'gc',p.gc);
end $$;

-- 결제 확정 — PG 웹훅(service_role) 또는 관리자. GC 발행(=충전액 1:1, 불변식 2)
create or replace function public.gc_charge_confirm(p_charge_id uuid, p_pg_provider text default null, p_pg_tx text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c gc_charges%rowtype; v_bal int;
begin
  if not ((select auth.role())='service_role' or _is_admin()) then
    return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  select * into c from gc_charges where id=p_charge_id;
  if c.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if c.status='paid' then return jsonb_build_object('ok',true,'already',true); end if;
  insert into gc_balances(user_id) values(c.user_id) on conflict (user_id) do nothing;
  update gc_balances set balance = balance + c.gc, updated_at=now() where user_id=c.user_id returning balance into v_bal;
  insert into gc_ledger(user_id, delta, reason, ref_id) values (c.user_id, c.gc, 'gc:charge', c.id);
  update gc_charges set status='paid', paid_at=now(), pg_provider=p_pg_provider, pg_tx_id=p_pg_tx where id=p_charge_id;
  return jsonb_build_object('ok',true,'credited',c.gc,'balance',v_bal);
end $$;

-- GC로 후원 — GC 차감 후 donations 행(paid, method='gc') 생성.
-- 분배(20/50/30)·수익요약·출금·관제는 기존 donations rail 무변경 재사용 (불변식 3)
create or replace function public.gc_donate(
  p_issue_id bigint, p_amount int, p_message text default null, p_anonymous boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_creator uuid; v_bal int;
  v_fee int; v_charity int; v_net int; v_tier text; v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_amount is null or p_amount < 500 or p_amount > 1000000 then
    return jsonb_build_object('ok',false,'reason','bad_amount'); end if;
  select user_id into v_creator from issues where id = p_issue_id;
  if v_creator is null then return jsonb_build_object('ok',false,'reason','no_issue'); end if;
  if v_creator = v_uid then return jsonb_build_object('ok',false,'reason','self'); end if;

  select balance into v_bal from gc_balances where user_id=v_uid for update;
  if coalesce(v_bal,0) < p_amount then
    return jsonb_build_object('ok',false,'reason','insufficient','balance',coalesce(v_bal,0)); end if;

  v_fee := floor(p_amount * 0.2)::int;       -- 플랫폼 20%
  v_charity := floor(p_amount * 0.3)::int;   -- 기부 30%
  v_net := p_amount - v_fee - v_charity;     -- 크리에이터 50%(+반올림 잔여)
  v_tier := _donation_tier(p_amount);

  update gc_balances set balance = balance - p_amount, updated_at=now() where user_id=v_uid;
  insert into donations(issue_id, creator_id, supporter_id, amount, fee, charity, net,
                        message, is_anonymous, tier, status, method, paid_at)
    values (p_issue_id, v_creator, v_uid, p_amount, v_fee, v_charity, v_net,
            nullif(btrim(left(coalesce(p_message,''),200)),''), coalesce(p_anonymous,false),
            v_tier, 'paid', 'gc', now())
    returning id into v_id;
  insert into gc_ledger(user_id, delta, reason, ref_id) values (v_uid, -p_amount, 'gc:donate', v_id);
  return jsonb_build_object('ok',true,'donation_id',v_id,'amount',p_amount,
    'fee',v_fee,'charity',v_charity,'net',v_net,'tier',v_tier,'balance',v_bal-p_amount);
end $$;

-- 회계 불변식 검증: 발행총액(paid 충전) − 후원소비 = 잔액총합 (오차 0이어야 함)
create or replace view public.gc_audit as
select
  (select coalesce(sum(gc),0) from gc_charges where status='paid')                      as issued,
  (select coalesce(-sum(delta),0) from gc_ledger where reason='gc:donate')              as spent,
  (select coalesce(sum(balance),0) from gc_balances)                                    as held,
  (select coalesce(sum(gc),0) from gc_charges where status='paid')
    - (select coalesce(-sum(delta),0) from gc_ledger where reason='gc:donate')
    - (select coalesce(sum(balance),0) from gc_balances)                                as drift;

grant execute on function public.gc_balance() to authenticated;
grant execute on function public.gc_charge_packages() to anon, authenticated;
grant execute on function public.gc_charge_begin(text) to authenticated;
grant execute on function public.gc_charge_confirm(uuid,text,text) to authenticated, service_role;
grant execute on function public.gc_donate(bigint,int,text,boolean) to authenticated;
