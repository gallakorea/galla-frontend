-- 🎨 닉네임 컬러/이펙트 팩 — 골드 외 다양한 스타일. 장착식(user_cosmetics.nick_style)
alter table public.user_cosmetics add column if not exists nick_style text;

create or replace function public._nickstyle_info(p_key text)
returns table(name text, price int) language sql immutable as $$
  select case p_key
    when 'none' then '기본' when 'gold' then '✨ 골드' when 'ice' then '❄️ 아이스'
    when 'neon' then '💠 네온' when 'toxic' then '☢️ 톡식' when 'fire' then '🔥 파이어'
    when 'royal' then '👑 로열' when 'rainbow' then '🌈 레인보우' else null end,
  case p_key
    when 'none' then 0 when 'gold' then 1500 when 'ice' then 2500 when 'neon' then 2500
    when 'toxic' then 3000 when 'fire' then 3500 when 'royal' then 8000 when 'rainbow' then 12000
    else null end;
$$;

create table if not exists public.user_nickstyles (
  user_id uuid not null, style_key text not null, acquired_at timestamptz not null default now(),
  primary key (user_id, style_key)
);
alter table public.user_nickstyles enable row level security;
drop policy if exists user_nickstyles_self on public.user_nickstyles;
create policy user_nickstyles_self on public.user_nickstyles for select using (auth.uid() = user_id);

create or replace function public.buy_nickstyle(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_name text; v_price int; v_bal double precision;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select name, price into v_name, v_price from _nickstyle_info(p_key);
  if v_name is null then return jsonb_build_object('ok',false,'reason','bad_key'); end if;
  if exists (select 1 from user_nickstyles where user_id=v_user and style_key=p_key) then
    return jsonb_build_object('ok',true,'already',true); end if;
  if v_price > 0 then
    insert into point_balances(user_id) values (v_user) on conflict do nothing;
    select balance into v_bal from point_balances where user_id=v_user for update;
    if coalesce(v_bal,0) < v_price then return jsonb_build_object('ok',false,'reason','insufficient'); end if;
    update point_balances set balance=balance-v_price, updated_at=now() where user_id=v_user;
    insert into point_ledger(user_id, delta, reason) values (v_user, -v_price, 'nickstyle:'||p_key);
  end if;
  insert into user_nickstyles(user_id, style_key) values (v_user, p_key) on conflict do nothing;
  return jsonb_build_object('ok',true,'key',p_key);
end $$;

create or replace function public.equip_nickstyle(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_name text; v_price int;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_key is null or p_key = 'none' then
    insert into user_cosmetics(user_id, nick_style) values (v_user, null)
      on conflict (user_id) do update set nick_style=null, updated_at=now();
    return jsonb_build_object('ok',true,'style',null);
  end if;
  select name, price into v_name, v_price from _nickstyle_info(p_key);
  if v_name is null then return jsonb_build_object('ok',false,'reason','bad_key'); end if;
  if v_price > 0 and not exists (select 1 from user_nickstyles where user_id=v_user and style_key=p_key) then
    return jsonb_build_object('ok',false,'reason','not_owned'); end if;
  insert into user_cosmetics(user_id, nick_style) values (v_user, p_key)
    on conflict (user_id) do update set nick_style=p_key, updated_at=now();
  return jsonb_build_object('ok',true,'style',p_key);
end $$;

create or replace function public.my_nickstyles()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'owned', coalesce((select jsonb_agg(style_key) from user_nickstyles where user_id=auth.uid()), '[]'::jsonb),
    'equipped', (select nick_style from user_cosmetics where user_id=auth.uid()));
$$;

-- 기존 nick_gold 보유자 → 'gold' 스타일 소유+장착으로 이관
insert into public.user_nickstyles(user_id, style_key)
  select user_id, 'gold' from public.user_cosmetics where nick_gold = true
  on conflict do nothing;
update public.user_cosmetics set nick_style = 'gold' where nick_gold = true and nick_style is null;

grant execute on function public.buy_nickstyle(text)   to authenticated;
grant execute on function public.equip_nickstyle(text) to authenticated;
grant execute on function public.my_nickstyles()       to authenticated;
