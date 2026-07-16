-- =========================================================
-- 전투 아이템 v1 — 창↔방패 군비경쟁 (2026-07-16)
--
-- 왜: 기존 전투 아이템(리셋권·침투권·부활권)은 전부 '내 편의용'이라 상호작용이 없어
--     소비가 안 돈다. "한쪽이 쓰면 상대도 써야" 소비가 돈다(사용자).
--
-- ★설계 불변식: v2의 "격파는 시간문제"를 절대 깨지 않는다.
--   - 🛡보호막: 피해 50%↓(14→7). 11방→21방으로 '느려질 뿐' 결국 격파 → 안전.
--   - ⚡파쇄: 보호막 제거 후 정상 피해 → 방패 무력화 수단이 항상 존재.
--   - ❌응급치료(회복상한 무시)는 의도적으로 제외 — GP만 있으면 불사가 되어
--     v2의 심장(유효회복 = min(heal, damage*0.3))이 무너진다.
--   - 보호막은 시간제(10분) — 영구 버프는 신규가 고인물을 영원히 못 이기게 만든다.
-- =========================================================

-- 1) 전투 효과(버프) — (스레드, 대상유저) 단위. HP 풀과 같은 스코프.
create table if not exists public.battle_effects (
  id         bigserial primary key,
  root_id    bigint not null,
  user_id    uuid   not null,          -- 보호받는 대상
  kind       text   not null check (kind in ('shield')),
  expires_at timestamptz not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists battle_effects_live_idx on public.battle_effects(root_id, user_id, kind, expires_at desc);
alter table public.battle_effects enable row level security;
drop policy if exists battle_effects_read on public.battle_effects;
create policy battle_effects_read on public.battle_effects for select using (true);  -- 공격자도 방패를 봐야 함
-- 쓰기는 SECURITY DEFINER RPC로만

-- 2) 가격표: 신규 2종 + ⚠️reply_pass 누락 복구(프론트는 300GP로 파는데 서버에 없어 구매 실패했음)
create or replace function public._item_price(p_key text)
returns integer language sql immutable as $function$
  select case p_key
    when 'cooldown_reset'  then 300
    when 'infiltrate_pass' then 500
    when 'reply_pass'      then 300
    when 'revive'          then 800
    when 'shield'          then 400
    when 'breaker'         then 500
    when 'emoticon_pack'   then 1000
    when 'nick_deco'       then 1500
    when 'duel_ticket'     then 700
    when 'sticker_pack_2'  then 1000
    when 'sticker_pack_3'  then 1000
    when 'gif_pack'        then 1500
    else null end;
$function$;

-- 3) 활성 보호막 조회
create or replace function public._has_shield(p_root bigint, p_user uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from battle_effects
                 where root_id=p_root and user_id=p_user and kind='shield' and expires_at > now());
$$;

-- 4) 🛡 보호막 사용 — 같은 진영 댓글(내 것 포함)에 10분 보호막
create or replace function public.use_shield(p_comment_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_user uuid := auth.uid(); v_root bigint; v_issue bigint;
  v_target_user uuid; v_target_side text; v_actor_side text; v_exp timestamptz;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select faction, issue_id, user_id into v_target_side, v_issue, v_target_user
    from comments where id=p_comment_id;
  if v_target_user is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  v_root := _root_of(p_comment_id);
  if v_root is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;

  select type into v_actor_side from votes where issue_id=v_issue and user_id=v_user limit 1;
  if coalesce(v_actor_side,'') not in ('pro','con') then return jsonb_build_object('ok',false,'reason','no_faction'); end if;
  if v_actor_side <> v_target_side then return jsonb_build_object('ok',false,'reason','cross_faction'); end if;

  if _has_shield(v_root, v_target_user) then return jsonb_build_object('ok',false,'reason','already_shielded'); end if;
  if not _consume_item(v_user, 'shield', p_comment_id) then return jsonb_build_object('ok',false,'reason','no_item'); end if;

  v_exp := now() + interval '10 minutes';
  insert into battle_effects(root_id, user_id, kind, expires_at, created_by)
    values (v_root, v_target_user, 'shield', v_exp, v_user);
  return jsonb_build_object('ok',true,'expires_at',v_exp);
end $$;

-- 5) battle_action: 보호막 감쇄 + 파쇄(p_break) 반영
create or replace function public.battle_action(
  p_comment_id bigint, p_action text, p_use_reset boolean default false, p_break boolean default false
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_target_side text; v_issue bigint; v_target_user uuid; v_root bigint;
  v_actor_side text; v_last timestamptz; v_wait int;
  v_hp_before int; v_hp int; v_dmg int; v_heal int; v_atk int;
  v_reset_used boolean := false; v_broke boolean := false; v_shielded boolean := false;
  c_cooldown constant int := 60;
  c_atk constant int := 14; c_def constant int := 6; c_sup constant int := 8;
  v_reward jsonb := jsonb_build_object('kind', null, 'gp', 0);
  v_gp int := 0; v_ko boolean := false; v_refarm boolean := false; v_assister uuid;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  if p_action not in ('attack','defend','support') then return jsonb_build_object('ok', false, 'reason', 'bad_action'); end if;

  select faction, issue_id, user_id into v_target_side, v_issue, v_target_user
    from comments where id = p_comment_id;
  if v_target_side is null or v_target_user is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  v_root := _root_of(p_comment_id);
  if v_root is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  select type into v_actor_side from votes where issue_id = v_issue and user_id = v_user limit 1;
  if coalesce(v_actor_side,'') not in ('pro','con') then return jsonb_build_object('ok', false, 'reason', 'no_faction'); end if;
  if p_action = 'attack' and v_actor_side = v_target_side then return jsonb_build_object('ok', false, 'reason', 'same_faction'); end if;
  if p_action in ('defend','support') and v_actor_side <> v_target_side then return jsonb_build_object('ok', false, 'reason', 'cross_faction'); end if;

  -- 쿨다운: (행위자, 대상'유저', 스레드, 액션)
  select max(ca.created_at) into v_last
    from comment_actions ca join comments c on c.id = ca.comment_id
   where ca.user_id = v_user and ca.action_type = p_action
     and c.user_id = v_target_user and (c.id = v_root or c.parent_id = v_root);
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

  insert into battle_hp(root_id, user_id, issue_id) values (v_root, v_target_user, v_issue)
    on conflict (root_id, user_id) do nothing;
  select damage, healed into v_dmg, v_heal from battle_hp where root_id=v_root and user_id=v_target_user for update;
  v_hp_before := _hp_of(v_dmg, v_heal);

  if p_action = 'attack' then
    -- ⚡파쇄: 보호막 제거 후 정상 피해 (아이템이 있을 때만 소모)
    if p_break and _has_shield(v_root, v_target_user)
       and _consume_item(v_user, 'breaker', p_comment_id) then
      delete from battle_effects where root_id=v_root and user_id=v_target_user and kind='shield';
      v_broke := true;
    end if;
    v_atk := c_atk;
    if _has_shield(v_root, v_target_user) then
      v_atk := ceil(c_atk * 0.5);   -- 🛡 보호막: 14 → 7 (느려질 뿐, 격파는 여전히 시간문제)
      v_shielded := true;
    end if;
    v_dmg := v_dmg + v_atk;
  else
    v_heal := v_heal + (case p_action when 'defend' then c_def else c_sup end);
  end if;
  update battle_hp set damage=v_dmg, healed=v_heal, updated_at=now()
   where root_id=v_root and user_id=v_target_user;

  update comments set
    attack_count  = attack_count  + (p_action = 'attack')::int,
    defense_count = defense_count + (p_action = 'defend')::int,
    support_count = support_count + (p_action = 'support')::int
  where id = p_comment_id;

  v_hp := _sync_pool_hp(v_root, v_target_user);

  if p_action = 'attack' and v_hp_before > 0 and v_hp = 0 then
    v_ko := true;
    if exists (select 1 from battle_merits where comment_id = p_comment_id and kind = 'ko'
                and created_at >= now() - interval '6 hours') then
      v_refarm := true;
    else
      v_gp := _battle_award(v_user, v_issue, p_comment_id, 'ko', 40);
      v_reward := jsonb_build_object('kind','ko','gp',v_gp);
      for v_assister in
        select distinct ca.user_id from comment_actions ca join comments c on c.id = ca.comment_id
         where c.user_id = v_target_user and (c.id = v_root or c.parent_id = v_root)
           and ca.action_type = 'attack' and ca.user_id <> v_user
           and ca.created_at >= now() - interval '1 hour'
      loop
        perform _battle_award(v_assister, v_issue, p_comment_id, 'assist', 8);
      end loop;
    end if;
  elsif p_action in ('defend','support') and v_hp_before <= 20 and v_hp > 20 then
    v_gp := _battle_award(v_user, v_issue, p_comment_id, 'guard', 12);
    v_reward := jsonb_build_object('kind','guard','gp',v_gp);
  end if;

  return jsonb_build_object('ok', true, 'hp', v_hp, 'hp_before', v_hp_before,
                            'actor_side', v_actor_side, 'cooldown', c_cooldown,
                            'reset_used', v_reset_used, 'ko', v_ko, 'refarm', v_refarm,
                            'reward', v_reward, 'dmg', v_atk,
                            'shielded', v_shielded, 'broke', v_broke,
                            'shield_on', _has_shield(v_root, v_target_user));
end $function$;

-- 6) 스레드의 활성 보호막 목록 (프론트 렌더용 — 누가 보호 중인지 표시)
create or replace function public.thread_shields(p_issue bigint)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_object_agg(k, 1), '{}'::jsonb) from (
    select distinct (e.root_id::text || ':' || e.user_id::text) as k
      from battle_effects e
     where e.kind='shield' and e.expires_at > now()
       and exists (select 1 from comments c where c.id = e.root_id and c.issue_id = p_issue)
  ) t;
$$;

grant execute on function public.use_shield(bigint) to authenticated;
grant execute on function public.thread_shields(bigint) to anon, authenticated;
revoke all on function public.use_shield(bigint) from anon;
