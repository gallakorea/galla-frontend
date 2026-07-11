-- GP 아이템 상점 + 인벤토리 + 전투 소비 훅
-- 아이템: cooldown_reset(⚡300) / infiltrate_pass(🕵️500) / revive(✨800)

create table if not exists public.user_items (
  user_id uuid not null,
  item_key text not null,
  qty integer not null default 0 check (qty >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_key)
);
alter table public.user_items enable row level security;
drop policy if exists user_items_self on public.user_items;
create policy user_items_self on public.user_items
  for select using (auth.uid() = user_id);

-- 침투권 등 '오늘 한도 확장' 소비 기록
create table if not exists public.item_uses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  item_key text not null,
  ref_id bigint,               -- 대상(댓글 등) 참조
  used_at timestamptz not null default now()
);
alter table public.item_uses enable row level security;
drop policy if exists item_uses_self on public.item_uses;
create policy item_uses_self on public.item_uses
  for select using (auth.uid() = user_id);

-- 카탈로그 (SQL 상수) : key → 가격
create or replace function public._item_price(p_key text)
returns int language sql immutable as $$
  select case p_key
    when 'cooldown_reset'  then 300
    when 'infiltrate_pass' then 500
    when 'revive'          then 800
    else null end;
$$;

-- 구매: GP 차감 + 인벤토리 적립
create or replace function public.buy_item(p_key text, p_qty int default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_price int; v_cost int; v_bal double precision; v_qty int;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  if p_qty < 1 or p_qty > 50 then return jsonb_build_object('ok', false, 'reason', 'bad_qty'); end if;
  v_price := _item_price(p_key);
  if v_price is null then return jsonb_build_object('ok', false, 'reason', 'bad_key'); end if;
  v_cost := v_price * p_qty;

  insert into point_balances (user_id) values (v_user) on conflict (user_id) do nothing;
  select balance into v_bal from point_balances where user_id = v_user for update;
  if v_bal < v_cost then
    return jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', v_bal, 'cost', v_cost);
  end if;

  update point_balances set balance = balance - v_cost, updated_at = now()
    where user_id = v_user returning balance into v_bal;
  insert into point_ledger (user_id, delta, reason) values (v_user, -v_cost, 'shop:'||p_key||'x'||p_qty);

  insert into user_items (user_id, item_key, qty) values (v_user, p_key, p_qty)
    on conflict (user_id, item_key) do update set qty = user_items.qty + excluded.qty, updated_at = now()
    returning qty into v_qty;

  return jsonb_build_object('ok', true, 'balance', v_bal, 'qty', v_qty);
end $$;

-- 인벤토리 조회
create or replace function public.my_items()
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(item_key, qty), '{}'::jsonb)
    from user_items where user_id = auth.uid() and qty > 0;
$$;

-- 내부: 아이템 1개 소비 (성공 시 true)
create or replace function public._consume_item(p_user uuid, p_key text, p_ref bigint default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_ok boolean := false;
begin
  update user_items set qty = qty - 1, updated_at = now()
    where user_id = p_user and item_key = p_key and qty > 0;
  v_ok := found;
  if v_ok then
    insert into item_uses (user_id, item_key, ref_id) values (p_user, p_key, p_ref);
  end if;
  return v_ok;
end $$;

-- 🕵️ 침투권 사용: 오늘 침투 한도 +1 (infiltration_status가 반영)
create or replace function public.use_infiltrate_pass()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  if not _consume_item(v_user, 'infiltrate_pass') then
    return jsonb_build_object('ok', false, 'reason', 'no_item');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- infiltration_status: 한도 = 3 + 오늘 사용한 침투권 수
create or replace function public.infiltration_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_used int; v_extra int;
  c_limit constant int := 3;
begin
  if v_user is null then
    return jsonb_build_object('used', 0, 'max', c_limit, 'left', c_limit);
  end if;
  select count(*) into v_used
    from comments c
    join votes v on v.issue_id = c.issue_id and v.user_id = c.user_id
   where c.user_id = v_user
     and c.parent_id is null
     and c.faction <> v.type
     and c.created_at >= date_trunc('day', now());
  select count(*) into v_extra
    from item_uses
   where user_id = v_user and item_key = 'infiltrate_pass'
     and used_at >= date_trunc('day', now());
  return jsonb_build_object('used', v_used, 'max', c_limit + v_extra,
                            'left', greatest(0, c_limit + v_extra - v_used));
end $$;

-- ✨ 부활권: 격파(hp=0)된 내 댓글을 HP 50으로 부활
create or replace function public.use_revive(p_comment_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_owner uuid; v_hp int;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  select user_id, hp into v_owner, v_hp from comments where id = p_comment_id;
  if v_owner is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_owner <> v_user then return jsonb_build_object('ok', false, 'reason', 'not_owner'); end if;
  if v_hp > 0 then return jsonb_build_object('ok', false, 'reason', 'alive'); end if;
  if not _consume_item(v_user, 'revive', p_comment_id) then
    return jsonb_build_object('ok', false, 'reason', 'no_item');
  end if;
  update comments set hp = 50 where id = p_comment_id;
  return jsonb_build_object('ok', true, 'hp', 50);
end $$;

-- ⚡ 쿨다운 리셋: battle_action에 p_use_reset 추가(쿨다운 걸릴 때만 소비)
drop function if exists public.battle_action(bigint, text);
create or replace function public.battle_action(p_comment_id bigint, p_action text, p_use_reset boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_target_side text;
  v_issue bigint;
  v_actor_side text;
  v_last timestamptz;
  v_wait int;
  v_hp int;
  v_reset_used boolean := false;
  c_cooldown constant int := 60;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthorized');
  end if;
  if p_action not in ('attack','defend','support') then
    return jsonb_build_object('ok', false, 'reason', 'bad_action');
  end if;

  select faction, issue_id into v_target_side, v_issue
    from comments where id = p_comment_id;
  if v_target_side is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select type into v_actor_side
    from votes
   where issue_id = v_issue and user_id = v_user
   limit 1;

  if coalesce(v_actor_side,'') not in ('pro','con') then
    return jsonb_build_object('ok', false, 'reason', 'no_faction');
  end if;

  if p_action = 'attack' and v_actor_side = v_target_side then
    return jsonb_build_object('ok', false, 'reason', 'same_faction');
  end if;
  if p_action in ('defend','support') and v_actor_side <> v_target_side then
    return jsonb_build_object('ok', false, 'reason', 'cross_faction');
  end if;

  -- 쿨다운: 같은 댓글·같은 액션 60초. ⚡리셋권 사용 시 1회 무시
  select max(created_at) into v_last
    from comment_actions
   where comment_id = p_comment_id and user_id = v_user and action_type = p_action;
  if v_last is not null and now() - v_last < make_interval(secs => c_cooldown) then
    if p_use_reset and _consume_item(v_user, 'cooldown_reset', p_comment_id) then
      v_reset_used := true;
    else
      v_wait := ceil(extract(epoch from (v_last + make_interval(secs => c_cooldown) - now())));
      return jsonb_build_object('ok', false, 'reason', 'cooldown', 'wait', v_wait);
    end if;
  end if;

  insert into comment_actions (comment_id, user_id, side, action_type)
  values (p_comment_id, v_user, v_actor_side, p_action);

  update comments set
    hp = greatest(0, least(100,
      hp + case p_action when 'attack' then -12 when 'defend' then 8 else 12 end)),
    attack_count  = attack_count  + (p_action = 'attack')::int,
    defense_count = defense_count + (p_action = 'defend')::int,
    support_count = support_count + (p_action = 'support')::int
  where id = p_comment_id
  returning hp into v_hp;

  return jsonb_build_object('ok', true, 'hp', v_hp, 'actor_side', v_actor_side,
                            'cooldown', c_cooldown, 'reset_used', v_reset_used);
end $$;
