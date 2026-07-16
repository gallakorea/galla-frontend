-- =========================================================
-- 전투 규칙 v2 — HP 풀링 + 누적 피해 (2026-07-16, 사용자 확정)
--
-- 왜: 기존은 ①HP가 댓글마다 따로라 한 사람이 댓글 5개면 생명 5개 ②지원(+12) ≥
--     공격(-12)이라 지원 한 명만 붙어도 상쇄, 두 명이면 오히려 회복 → 격파 불가능.
--     "안그러고서는 HP 절대 소진 못 시킨다"(사용자).
--
-- v2 3원칙:
--  ① HP 풀 = (스레드 root, 유저). 한 사람 = 한 생명. 그의 어느 댓글을 때려도 같은 HP.
--  ② 누적 피해는 지워지지 않는다: 유효회복 = min(총회복, 총피해 × 0.3)
--     → HP = 100 - 피해 + 유효회복. 힐이 무한이어도 누적피해 143이면 HP=0. 격파는 시간문제.
--  ③ 쿨다운 기준을 (공격자, 대상유저, 스레드)로 이동. 풀링만 하면 같은 사람의 댓글
--     여러 개를 연타해 쿨다운을 우회하는 구멍이 생기므로 반드시 동반 변경.
--
-- 수치: 공격 -14 / 방어 +6 / 지원 +8 (힐 < 공격). 단독 10방(≈10분), 3명이면 ≈3분.
-- 기존 진행 전투는 전체 초기화(사용자 확정) — 풀 구조로 바뀌어 이전 hp 이관이 무의미.
-- =========================================================

-- 1) HP 풀: 스레드(root) × 유저 = 하나의 생명
create table if not exists public.battle_hp (
  root_id     bigint not null,          -- 최상위 댓글 id (스레드 식별)
  user_id     uuid   not null,
  issue_id    bigint,
  damage      int    not null default 0,  -- 누적 피해(영구, 힐로 안 지워짐)
  healed      int    not null default 0,  -- 누적 회복(유효분은 damage*0.3까지만 인정)
  updated_at  timestamptz not null default now(),
  primary key (root_id, user_id)
);
create index if not exists battle_hp_issue_idx on public.battle_hp(issue_id);
alter table public.battle_hp enable row level security;
drop policy if exists battle_hp_read on public.battle_hp;
create policy battle_hp_read on public.battle_hp for select using (true);  -- 관전자도 HP를 봐야 함
-- 쓰기 정책 없음 → SECURITY DEFINER RPC로만 변경

-- 2) 풀 → 표시 HP 계산 (단일 진실 공급원)
create or replace function public._hp_of(p_damage int, p_healed int)
returns int language sql immutable as $$
  select greatest(0, least(100, 100 - p_damage + least(p_healed, floor(p_damage * 0.3)::int)));
$$;

-- 3) 스레드 루트 찾기 (답글의 답글도 1depth로 승격 — 프론트 rootIdOf와 동일 규칙)
create or replace function public._root_of(p_comment bigint)
returns bigint language sql stable security definer set search_path to 'public' as $$
  with recursive up as (
    select id, parent_id from comments where id = p_comment
    union all
    select c.id, c.parent_id from comments c join up on c.id = up.parent_id
  )
  select id from up where parent_id is null limit 1;
$$;

-- 4) 풀 HP를 그 유저의 모든 댓글에 미러링 → 프론트는 기존대로 comments.hp만 읽으면 됨
create or replace function public._sync_pool_hp(p_root bigint, p_user uuid)
returns int language plpgsql security definer set search_path to 'public' as $$
declare v_hp int;
begin
  select _hp_of(damage, healed) into v_hp from battle_hp where root_id=p_root and user_id=p_user;
  v_hp := coalesce(v_hp, 100);
  update comments set hp = v_hp
   where user_id = p_user and (id = p_root or parent_id = p_root);
  return v_hp;
end $$;

-- 5) battle_action 재작성 — 풀 기준 피해/회복 + 쿨다운은 (행위자, 대상유저, 스레드)
create or replace function public.battle_action(p_comment_id bigint, p_action text, p_use_reset boolean default false)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_target_side text; v_issue bigint; v_target_user uuid; v_root bigint;
  v_actor_side text; v_last timestamptz; v_wait int;
  v_hp_before int; v_hp int; v_dmg int; v_heal int;
  v_reset_used boolean := false;
  c_cooldown constant int := 60;
  c_atk constant int := 14; c_def constant int := 6; c_sup constant int := 8;
  v_reward jsonb := jsonb_build_object('kind', null, 'gp', 0);
  v_gp int := 0; v_ko boolean := false; v_refarm boolean := false; v_assister uuid;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  if p_action not in ('attack','defend','support') then return jsonb_build_object('ok', false, 'reason', 'bad_action'); end if;

  select faction, issue_id, user_id into v_target_side, v_issue, v_target_user
    from comments where id = p_comment_id;
  if v_target_side is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_target_user is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  v_root := _root_of(p_comment_id);
  if v_root is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  select type into v_actor_side from votes where issue_id = v_issue and user_id = v_user limit 1;
  if coalesce(v_actor_side,'') not in ('pro','con') then return jsonb_build_object('ok', false, 'reason', 'no_faction'); end if;
  if p_action = 'attack' and v_actor_side = v_target_side then return jsonb_build_object('ok', false, 'reason', 'same_faction'); end if;
  if p_action in ('defend','support') and v_actor_side <> v_target_side then return jsonb_build_object('ok', false, 'reason', 'cross_faction'); end if;

  -- 쿨다운: (행위자, 대상 '유저', 스레드, 액션) — 대상의 댓글을 갈아타며 연타하는 우회 차단
  select max(ca.created_at) into v_last
    from comment_actions ca join comments c on c.id = ca.comment_id
   where ca.user_id = v_user and ca.action_type = p_action
     and c.user_id = v_target_user
     and (c.id = v_root or c.parent_id = v_root);
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

  -- 풀 확보 + 이전 HP
  insert into battle_hp(root_id, user_id, issue_id) values (v_root, v_target_user, v_issue)
    on conflict (root_id, user_id) do nothing;
  select damage, healed into v_dmg, v_heal from battle_hp where root_id=v_root and user_id=v_target_user for update;
  v_hp_before := _hp_of(v_dmg, v_heal);

  if p_action = 'attack' then
    v_dmg := v_dmg + c_atk;
  else
    v_heal := v_heal + (case p_action when 'defend' then c_def else c_sup end);
  end if;
  update battle_hp set damage=v_dmg, healed=v_heal, updated_at=now()
   where root_id=v_root and user_id=v_target_user;

  -- 표시용 카운터는 기존대로 해당 댓글에
  update comments set
    attack_count  = attack_count  + (p_action = 'attack')::int,
    defense_count = defense_count + (p_action = 'defend')::int,
    support_count = support_count + (p_action = 'support')::int
  where id = p_comment_id;

  v_hp := _sync_pool_hp(v_root, v_target_user);   -- 그 유저의 스레드 내 모든 댓글에 반영

  -- === 보상 (기존 규칙 유지) ===
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
                            'reward', v_reward, 'pool', jsonb_build_object('damage', v_dmg, 'healed', v_heal));
end $function$;

-- 6) 기존 전투 HP 초기화(사용자 확정) — 풀 구조로 전환되며 이전 hp는 이관이 무의미
truncate table public.battle_hp;
update public.comments set hp = 100 where hp <> 100;
-- ⚠️ comment_actions 는 절대 지우지 않는다: 갈라리안 전투지수·전투력·명예 집계의 원천이라
--    지우면 유저 전적이 소실된다. 과거 로그는 이미 60초가 지나 쿨다운 판정에 영향 없음.
