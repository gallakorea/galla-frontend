-- =========================================================
-- 갈라 전투 보상 규칙 v1 (2026-07-16)
-- 문서상 "미해결 핵심 과제"(공격에 보상·승부 유인 없음) 해결.
-- 원칙: 공격=적 유닛 격파 목표+보상, 방어/지원=위기 아군 수호 보상.
--   무료 GP만 지급(사행성·현금화 무관, 게임 루프 내부). [[galla-monetization]]
-- 보상: 격파(막타) +40GP+전공 / 어시스트(최근 공격 기여) +8GP / 수호(위기→안전) +12GP.
-- 남용방지: 일일 전투 GP 캡 400 / 같은 유닛 재격파 6h 쿨다운 / 60s 액션 쿨다운 유지.
-- =========================================================

-- 1) 전공 원장 — GP 캡과 무관하게 모든 전투 성과를 기록(전공 집계·명예용).
create table if not exists public.battle_merits (
  id          bigserial primary key,
  user_id     uuid   not null,
  comment_id  bigint not null,
  issue_id    bigint,
  kind        text   not null check (kind in ('ko','assist','guard')),
  gp_awarded  int    not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists battle_merits_user_idx on public.battle_merits(user_id, created_at desc);
create index if not exists battle_merits_comment_idx on public.battle_merits(comment_id, kind, created_at desc);
create index if not exists battle_merits_issue_idx on public.battle_merits(issue_id);

alter table public.battle_merits enable row level security;
drop policy if exists battle_merits_read on public.battle_merits;
create policy battle_merits_read on public.battle_merits for select using (true);
-- 직접 insert 정책 없음 → SECURITY DEFINER RPC로만 기록.

-- 2) 보상 지급 헬퍼 — 일일 캡 적용 후 전공 기록 + (캡 내라면) 무료 GP 지급.
--    반환 = 실제 지급된 GP(캡에 걸리면 0).
create or replace function public._battle_award(
  p_user uuid, p_issue bigint, p_comment bigint, p_kind text, p_base int
) returns int
language plpgsql security definer set search_path to 'public' as $$
declare
  c_daily_cap constant int := 400;
  v_today numeric;
  v_grant int;
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
begin
  if p_user is null then return 0; end if;

  select coalesce(sum(delta),0) into v_today
    from point_ledger
   where user_id = p_user and delta > 0
     and reason like 'battle:%'
     and created_at >= v_day_start;

  v_grant := greatest(0, least(p_base, c_daily_cap - v_today::int));

  insert into battle_merits(user_id, comment_id, issue_id, kind, gp_awarded)
  values (p_user, p_comment, p_issue, p_kind, v_grant);

  if v_grant > 0 then
    insert into point_balances(user_id, balance) values (p_user, v_grant)
      on conflict (user_id) do update set balance = point_balances.balance + v_grant,
                                          updated_at = now();
    insert into point_ledger(user_id, delta, reason) values (p_user, v_grant, 'battle:'||p_kind);
  end if;

  return v_grant;
end $$;

-- 3) battle_action 확장 — HP 임계 교차 판정 + 격파/어시스트/수호 보상.
create or replace function public.battle_action(p_comment_id bigint, p_action text, p_use_reset boolean DEFAULT false)
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
  v_hp_before int;
  v_reset_used boolean := false;
  c_cooldown constant int := 60;
  v_reward jsonb := jsonb_build_object('kind', null, 'gp', 0);
  v_gp int := 0;
  v_ko boolean := false;
  v_refarm boolean := false;
  v_assister uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthorized');
  end if;
  if p_action not in ('attack','defend','support') then
    return jsonb_build_object('ok', false, 'reason', 'bad_action');
  end if;

  select faction, issue_id, hp into v_target_side, v_issue, v_hp_before
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

  -- === 보상 판정 ===
  -- 격파: 공격으로 살아있던(>0) 유닛을 0으로. 최근 6h 내 이 유닛 격파 기록 있으면 재파밍 차단.
  if p_action = 'attack' and v_hp_before > 0 and v_hp = 0 then
    v_ko := true;
    if exists (select 1 from battle_merits
                where comment_id = p_comment_id and kind = 'ko'
                  and created_at >= now() - interval '6 hours') then
      v_refarm := true;  -- 부활 후 반복 격파 → 보상 없음
    else
      v_gp := _battle_award(v_user, v_issue, p_comment_id, 'ko', 40);
      v_reward := jsonb_build_object('kind','ko','gp',v_gp);
      -- 어시스트: 최근 1시간 내 이 유닛을 함께 공격한 다른 유저들
      for v_assister in
        select distinct user_id from comment_actions
         where comment_id = p_comment_id and action_type = 'attack'
           and user_id <> v_user and created_at >= now() - interval '1 hour'
      loop
        perform _battle_award(v_assister, v_issue, p_comment_id, 'assist', 8);
      end loop;
    end if;
  -- 수호: 방어/지원으로 위기(≤20) 아군을 안전(>20)으로 되살림
  elsif p_action in ('defend','support') and v_hp_before <= 20 and v_hp > 20 then
    v_gp := _battle_award(v_user, v_issue, p_comment_id, 'guard', 12);
    v_reward := jsonb_build_object('kind','guard','gp',v_gp);
  end if;

  return jsonb_build_object('ok', true, 'hp', v_hp, 'actor_side', v_actor_side,
                            'cooldown', c_cooldown, 'reset_used', v_reset_used,
                            'ko', v_ko, 'refarm', v_refarm, 'reward', v_reward);
end $function$;

-- 4) 전공 집계 조회(프론트 명예/등급용) — 유저별 격파·어시스트·수호·획득GP.
create or replace function public.battle_merit_stats(p_user uuid)
 returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'ko',     coalesce(count(*) filter (where kind='ko'),0),
    'assist', coalesce(count(*) filter (where kind='assist'),0),
    'guard',  coalesce(count(*) filter (where kind='guard'),0),
    'gp',     coalesce(sum(gp_awarded),0)
  ) from battle_merits where user_id = p_user;
$$;

grant execute on function public.battle_merit_stats(uuid) to anon, authenticated;
