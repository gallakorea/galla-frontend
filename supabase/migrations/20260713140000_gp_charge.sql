-- 💳 GP 충전(현금→GP) — PG 연결 직전까지. 충전 GP는 랭킹(누적 획득)에서 제외.
create table if not exists public.gp_packages (
  key text primary key, krw int not null, gp int not null, bonus int not null default 0,
  label text, sort int not null default 0, active boolean not null default true
);
insert into public.gp_packages(key,krw,gp,bonus,label,sort) values
  ('p1',  1000, 1000,   0,  null,        1),
  ('p3',  3000, 3000,   0,  null,        2),
  ('p5',  5000, 5000,   250,'+5% 보너스', 3),
  ('p10', 10000,10000, 1000,'+10% 보너스',4),
  ('p30', 30000,30000, 4500,'+15% 보너스',5),
  ('p50', 50000,50000, 10000,'+20% 보너스',6)
on conflict (key) do update set krw=excluded.krw, gp=excluded.gp, bonus=excluded.bonus, label=excluded.label, sort=excluded.sort;
alter table public.gp_packages enable row level security;
drop policy if exists gp_packages_read on public.gp_packages;
create policy gp_packages_read on public.gp_packages for select using (true);

create table if not exists public.gp_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  pkg text, krw int not null, gp int not null, bonus int not null default 0,
  status text not null default 'pending' check (status in ('pending','paid','failed','canceled')),
  pg_provider text, pg_tx_id text,
  created_at timestamptz not null default now(), paid_at timestamptz
);
alter table public.gp_charges enable row level security;
drop policy if exists gp_charges_own on public.gp_charges;
create policy gp_charges_own on public.gp_charges for select
  using (user_id = auth.uid() or _is_admin());

-- 랭킹(누적 획득 GP)에서 충전분 제외
create or replace function public.lifetime_gp(p_user uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select (10000 + coalesce((select sum(delta) filter (where delta>0 and reason not like 'charge:%')
    from point_ledger where user_id = p_user), 0))::bigint;
$$;

-- 충전 패키지 목록 + 첫 충전 보너스 안내
create or replace function public.charge_packages()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_first boolean := true; v jsonb;
begin
  if auth.uid() is not null then
    v_first := not exists (select 1 from gp_charges where user_id=auth.uid() and status='paid');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('key',key,'krw',krw,'gp',gp,'bonus',bonus,'label',label) order by sort), '[]'::jsonb)
    into v from gp_packages where active;
  return jsonb_build_object('ok',true,'packages',v,'first_charge',v_first);
end $$;

-- 충전 시작(pending) — PG가 결제, charge_confirm으로 GP 지급
create or replace function public.charge_begin(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); p gp_packages%rowtype; v_bonus int; v_first boolean; v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select * into p from gp_packages where key=p_key and active;
  if p.key is null then return jsonb_build_object('ok',false,'reason','bad_package'); end if;
  v_first := not exists (select 1 from gp_charges where user_id=v_uid and status='paid');
  v_bonus := p.bonus + case when v_first then round(p.gp*0.5)::int else 0 end;  -- 첫 충전 +50%
  insert into gp_charges(user_id,pkg,krw,gp,bonus,status)
    values (v_uid, p.key, p.krw, p.gp, v_bonus, 'pending') returning id into v_id;
  return jsonb_build_object('ok',true,'charge_id',v_id,'krw',p.krw,'gp',p.gp,'bonus',v_bonus,
    'total', p.gp+v_bonus, 'first_charge', v_first);
end $$;

-- 결제 확정 — PG 웹훅(service_role) 또는 관리자. GP 지급(충전분은 랭킹 제외됨)
create or replace function public.charge_confirm(p_charge_id uuid, p_pg_provider text default null, p_pg_tx text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c gp_charges%rowtype; v_total int; v_bal numeric;
begin
  if not ((select auth.role())='service_role' or _is_admin()) then
    return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  select * into c from gp_charges where id=p_charge_id;
  if c.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if c.status='paid' then return jsonb_build_object('ok',true,'already',true); end if;
  v_total := c.gp + c.bonus;
  insert into point_balances(user_id) values(c.user_id) on conflict (user_id) do nothing;
  update point_balances set balance = balance + v_total where user_id=c.user_id returning balance into v_bal;
  insert into point_ledger(user_id, delta, reason) values (c.user_id, v_total, 'charge:'||coalesce(c.pkg,'gp'));
  update gp_charges set status='paid', paid_at=now(), pg_provider=p_pg_provider, pg_tx_id=p_pg_tx where id=p_charge_id;
  return jsonb_build_object('ok',true,'credited',v_total,'balance',v_bal);
end $$;

grant execute on function public.charge_packages() to anon, authenticated;
grant execute on function public.charge_begin(text) to authenticated;
grant execute on function public.charge_confirm(uuid,text,text) to authenticated, service_role;
