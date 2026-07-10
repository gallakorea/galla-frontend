-- 댓글 대전 진영 규칙 서버 강제
--  * 행위자의 진영 = 해당 이슈에 대한 본인의 투표(votes.type). 투표 없으면 참전 불가.
--  * attack  : 반대 진영 댓글에만 가능 (자기 진영 자해 공격 차단)
--  * defend/support : 같은 진영 댓글에만 가능 (적 진영 회복 차단)
--  * comment_actions.side 는 '행위자의 진영'을 기록 (기존엔 대상 댓글 진영을 잘못 저장)
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
  v_hp int;
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

  begin
    insert into comment_actions (comment_id, user_id, side, action_type)
    values (p_comment_id, v_user, v_actor_side, p_action);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end;

  update comments set
    hp = greatest(0, least(100,
      hp + case p_action when 'attack' then -12 when 'defend' then 8 else 12 end)),
    attack_count  = attack_count  + (p_action = 'attack')::int,
    defense_count = defense_count + (p_action = 'defend')::int,
    support_count = support_count + (p_action = 'support')::int
  where id = p_comment_id
  returning hp into v_hp;

  return jsonb_build_object('ok', true, 'hp', v_hp, 'actor_side', v_actor_side);
end $function$;
