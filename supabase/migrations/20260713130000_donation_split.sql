-- 후원 분배 변경: 플랫폼 20% / 발의자 50% / 기부 30% + 소액 티어
alter table public.donations add column if not exists charity int not null default 0;

create or replace function public._donation_tier(p_amount int)
returns text language sql immutable as $$
  select case when p_amount >= 20000 then 'red' when p_amount >= 10000 then 'orange'
              when p_amount >= 5000 then 'yellow' when p_amount >= 3000 then 'green'
              when p_amount >= 2000 then 'teal' when p_amount >= 1000 then 'sky'
              else 'blue' end $$;

create or replace function public.donate_begin(
  p_issue_id bigint, p_amount int, p_message text default null, p_anonymous boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_creator uuid; v_fee int; v_charity int; v_net int; v_id uuid; v_tier text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_amount is null or p_amount < 500 or p_amount > 1000000 then
    return jsonb_build_object('ok',false,'reason','bad_amount'); end if;
  select user_id into v_creator from issues where id = p_issue_id;
  if v_creator is null then return jsonb_build_object('ok',false,'reason','no_issue'); end if;
  if v_creator = v_uid then return jsonb_build_object('ok',false,'reason','self'); end if;
  v_fee := floor(p_amount * 0.2)::int;        -- 플랫폼 20%
  v_charity := floor(p_amount * 0.3)::int;     -- 기부 30%
  v_net := p_amount - v_fee - v_charity;       -- 발의자 50%(+반올림 잔여)
  v_tier := _donation_tier(p_amount);
  insert into donations(issue_id, creator_id, supporter_id, amount, fee, charity, net, message, is_anonymous, tier, status)
    values (p_issue_id, v_creator, v_uid, p_amount, v_fee, v_charity, v_net,
            nullif(btrim(left(coalesce(p_message,''),200)),''), coalesce(p_anonymous,false), v_tier, 'pending')
    returning id into v_id;
  return jsonb_build_object('ok',true,'donation_id',v_id,'amount',p_amount,
    'fee',v_fee,'charity',v_charity,'net',v_net,'tier',v_tier);
end $$;

-- 누적 기부액(전체) 조회
create or replace function public.charity_total()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok',true,
    'total', coalesce((select sum(charity) from donations where status='paid'),0),
    'count', coalesce((select count(*) from donations where status='paid'),0));
$$;
grant execute on function public.charity_total() to anon, authenticated;
