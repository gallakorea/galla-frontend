-- 전투 액션 1회 제한 → 쿨다운제 (주고받는 공성전)
-- 같은 댓글·같은 액션은 60초 쿨다운 후 재사용 가능. 진영 규칙은 유지.
drop index if exists public.comment_actions_once;
create index if not exists idx_comment_actions_cooldown
  on public.comment_actions (user_id, comment_id, action_type, created_at desc);

create or replace function public.battle_action(p_comment_id bigint, p_action text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_target_side text;
  v_issue bigint;
  v_actor_side text;
  v_last timestamptz;
  v_wait int;
  v_hp int;
  c_cooldown constant int := 60; -- 초
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

  -- 행위자 진영 = 그 이슈에 대한 본인 투표
  select type into v_actor_side
    from votes
   where issue_id = v_issue and user_id = v_user
   limit 1;

  if coalesce(v_actor_side,'') not in ('pro','con') then
    return jsonb_build_object('ok', false, 'reason', 'no_faction');
  end if;

  -- 진영 교차 규칙
  if p_action = 'attack' and v_actor_side = v_target_side then
    return jsonb_build_object('ok', false, 'reason', 'same_faction');
  end if;
  if p_action in ('defend','support') and v_actor_side <> v_target_side then
    return jsonb_build_object('ok', false, 'reason', 'cross_faction');
  end if;

  -- 쿨다운: 같은 댓글·같은 액션 60초
  select max(created_at) into v_last
    from comment_actions
   where comment_id = p_comment_id and user_id = v_user and action_type = p_action;
  if v_last is not null and now() - v_last < make_interval(secs => c_cooldown) then
    v_wait := ceil(extract(epoch from (v_last + make_interval(secs => c_cooldown) - now())));
    return jsonb_build_object('ok', false, 'reason', 'cooldown', 'wait', v_wait);
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

  return jsonb_build_object('ok', true, 'hp', v_hp, 'actor_side', v_actor_side, 'cooldown', c_cooldown);
end $function$;
