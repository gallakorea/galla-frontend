-- 💝 발의자 후원(슈퍼챗형) — 실제 원화 후원. PG 연결 직전까지의 백엔드.
create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  issue_id bigint references issues(id) on delete cascade,
  creator_id uuid not null,           -- 이슈 발의자
  supporter_id uuid,                  -- 후원자
  amount int not null,                -- 후원액(원)
  fee int not null default 0,         -- 플랫폼 수수료
  net int not null default 0,         -- 발의자 정산액
  message text,                       -- 슈퍼챗 메시지
  is_anonymous boolean not null default false,
  tier text,
  status text not null default 'pending'
    check (status in ('pending','paid','failed','refunded','canceled')),
  pg_provider text, pg_tx_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists idx_donations_issue_paid on public.donations(issue_id, created_at desc) where status='paid';
create index if not exists idx_donations_creator on public.donations(creator_id) where status='paid';
create index if not exists idx_donations_supporter on public.donations(supporter_id);

alter table public.donations enable row level security;
drop policy if exists donations_read_own on public.donations;
create policy donations_read_own on public.donations for select
  using (supporter_id = auth.uid() or creator_id = auth.uid() or _is_admin());
-- 공개 표시는 issue_donations() 정의자함수로만 (익명 보호)

-- 수수료 20%
create or replace function public._donation_fee(p_amount int)
returns int language sql immutable as $$ select floor(p_amount * 0.2)::int $$;

create or replace function public._donation_tier(p_amount int)
returns text language sql immutable as $$
  select case when p_amount >= 100000 then 'red' when p_amount >= 50000 then 'orange'
              when p_amount >= 30000 then 'yellow' when p_amount >= 10000 then 'green'
              when p_amount >= 5000 then 'teal' when p_amount >= 3000 then 'sky'
              else 'blue' end $$;

-- 후원 시작(pending 생성) — 이후 PG가 결제, donate_confirm으로 확정
create or replace function public.donate_begin(
  p_issue_id bigint, p_amount int, p_message text default null, p_anonymous boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_creator uuid; v_fee int; v_net int; v_id uuid; v_tier text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_amount is null or p_amount < 1000 or p_amount > 1000000 then
    return jsonb_build_object('ok',false,'reason','bad_amount'); end if;
  select user_id into v_creator from issues where id = p_issue_id;
  if v_creator is null then return jsonb_build_object('ok',false,'reason','no_issue'); end if;
  if v_creator = v_uid then return jsonb_build_object('ok',false,'reason','self'); end if;
  v_fee := _donation_fee(p_amount); v_net := p_amount - v_fee; v_tier := _donation_tier(p_amount);
  insert into donations(issue_id, creator_id, supporter_id, amount, fee, net, message, is_anonymous, tier, status)
    values (p_issue_id, v_creator, v_uid, p_amount, v_fee, v_net,
            nullif(btrim(left(coalesce(p_message,''),200)),''), coalesce(p_anonymous,false), v_tier, 'pending')
    returning id into v_id;
  return jsonb_build_object('ok',true,'donation_id',v_id,'amount',p_amount,'fee',v_fee,'net',v_net,'tier',v_tier);
end $$;

-- 결제 확정 — PG 웹훅(service_role) 또는 관리자만. 실제 PG 연결 시 웹훅이 호출.
create or replace function public.donate_confirm(
  p_donation_id uuid, p_pg_provider text default null, p_pg_tx text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d donations%rowtype;
begin
  if not ((select auth.role()) = 'service_role' or _is_admin()) then
    return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  select * into d from donations where id = p_donation_id;
  if d.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if d.status = 'paid' then return jsonb_build_object('ok',true,'already',true); end if;
  update donations set status='paid', paid_at=now(),
    pg_provider=p_pg_provider, pg_tx_id=p_pg_tx where id=p_donation_id;
  return jsonb_build_object('ok',true);
end $$;

-- 이슈의 후원(슈퍼챗) 목록 + 합계 — 공개, 익명 보호
create or replace function public.issue_donations(p_issue_id bigint, p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_rows jsonb; v_total int; v_cnt int;
begin
  select coalesce(sum(amount),0), count(*) into v_total, v_cnt
    from donations where issue_id=p_issue_id and status='paid';
  select coalesce(jsonb_agg(x order by amount desc, created_at desc), '[]'::jsonb) into v_rows from (
    select jsonb_build_object(
      'id', d.id, 'amount', d.amount, 'message', d.message, 'tier', d.tier, 'created_at', d.created_at,
      'name', case when d.is_anonymous then '익명의 후원자' else coalesce(u.nickname,'후원자') end,
      'avatar', case when d.is_anonymous then null else u.avatar_url end
    ) x, d.amount, d.created_at
    from donations d left join users u on u.id = d.supporter_id
    where d.issue_id = p_issue_id and d.status = 'paid'
    limit p_limit
  ) t;
  return jsonb_build_object('ok',true,'total',v_total,'count',v_cnt,'rows',v_rows);
end $$;

-- 발의자 수익 요약
create or replace function public.my_creator_earnings()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_net int; v_cnt int; v_withdrawn int; v_pending int;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select coalesce(sum(net),0), count(*) into v_net, v_cnt
    from donations where creator_id=v_uid and status='paid';
  select coalesce(sum(amount),0) into v_withdrawn
    from withdrawals where user_id=v_uid and status in ('done','completed','approved');
  select coalesce(sum(amount),0) into v_pending
    from withdrawals where user_id=v_uid and status in ('pending','processing');
  return jsonb_build_object('ok',true,'total_net',v_net,'supporter_count',v_cnt,
    'withdrawn',v_withdrawn,'pending',v_pending,'available', v_net - v_withdrawn - v_pending);
end $$;

-- 출금 신청 (실제 송금은 PG/뱅킹 연결 후)
create or replace function public.request_withdrawal(
  p_amount int, p_bank text, p_account text, p_holder text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_avail int;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_amount is null or p_amount < 10000 then return jsonb_build_object('ok',false,'reason','min_10000'); end if;
  select (my_creator_earnings()->>'available')::int into v_avail;
  if v_avail < p_amount then return jsonb_build_object('ok',false,'reason','insufficient','available',v_avail); end if;
  if coalesce(btrim(p_bank),'')='' or coalesce(btrim(p_account),'')='' or coalesce(btrim(p_holder),'')='' then
    return jsonb_build_object('ok',false,'reason','need_bank'); end if;
  insert into withdrawals(user_id, bank, account_number, holder, amount, status)
    values (v_uid, p_bank, p_account, p_holder, p_amount, 'pending');
  return jsonb_build_object('ok',true);
end $$;

grant execute on function public.donate_begin(bigint,int,text,boolean) to authenticated;
grant execute on function public.donate_confirm(uuid,text,text) to authenticated, service_role;
grant execute on function public.issue_donations(bigint,int) to anon, authenticated;
grant execute on function public.my_creator_earnings() to authenticated;
grant execute on function public.request_withdrawal(int,text,text,text) to authenticated;
