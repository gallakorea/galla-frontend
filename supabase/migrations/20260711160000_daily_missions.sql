-- 데일리 미션: 실제 활동 기반 진행도 + 포인트(GP) 보상 (point_balances 통합 지갑)
create table if not exists public.mission_claims (
  user_id uuid not null,
  mission_key text not null,
  claim_date date not null,
  reward integer not null,
  created_at timestamptz not null default now(),
  primary key (user_id, mission_key, claim_date)
);
alter table public.mission_claims enable row level security;
drop policy if exists mission_claims_self on public.mission_claims;
create policy mission_claims_self on public.mission_claims
  for select using (auth.uid() = user_id);

-- KST 오늘 시작(UTC 저장 timestamp 컬럼과 비교용) + KST 오늘 날짜
create or replace function public._kst_day_start()
returns timestamp language sql stable as $$
  select (((now() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul') at time zone 'UTC');
$$;
create or replace function public._kst_today()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Seoul')::date;
$$;

-- 오늘의 미션 진행도(실시간 계산) + 수령 여부
create or replace function public.daily_mission_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_start timestamp := _kst_day_start();
  v_today date := _kst_today();
  v_votes int; v_comments int; v_battle int;
  v_res jsonb;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;

  select count(*) into v_votes    from votes          where user_id = v_user and created_at >= v_start;
  select count(*) into v_comments from comments        where user_id = v_user and created_at >= v_start;
  select count(*) into v_battle   from comment_actions where user_id = v_user and created_at >= v_start;

  v_res := jsonb_build_array(
    jsonb_build_object('key','vote','icon','🗳️','title','찬반 투표 5회','goal',5,'reward',200,
      'progress', least(v_votes,5), 'raw', v_votes,
      'claimed', exists(select 1 from mission_claims where user_id=v_user and mission_key='vote' and claim_date=v_today)),
    jsonb_build_object('key','comment','icon','💬','title','참전 댓글 3개','goal',3,'reward',300,
      'progress', least(v_comments,3), 'raw', v_comments,
      'claimed', exists(select 1 from mission_claims where user_id=v_user and mission_key='comment' and claim_date=v_today)),
    jsonb_build_object('key','battle','icon','⚔️','title','전투 액션 3회(공격·방어·지원)','goal',3,'reward',300,
      'progress', least(v_battle,3), 'raw', v_battle,
      'claimed', exists(select 1 from mission_claims where user_id=v_user and mission_key='battle' and claim_date=v_today))
  );
  return jsonb_build_object('ok', true, 'missions', v_res, 'today', v_today);
end $$;

-- 미션 보상 수령 (하루 1회/미션, 목표 달성 시에만)
create or replace function public.claim_mission(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_start timestamp := _kst_day_start();
  v_today date := _kst_today();
  v_goal int; v_reward int; v_cnt int; v_bal double precision;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;

  if    p_key = 'vote'    then v_goal := 5; v_reward := 200;
        select count(*) into v_cnt from votes where user_id=v_user and created_at >= v_start;
  elsif p_key = 'comment' then v_goal := 3; v_reward := 300;
        select count(*) into v_cnt from comments where user_id=v_user and created_at >= v_start;
  elsif p_key = 'battle'  then v_goal := 3; v_reward := 300;
        select count(*) into v_cnt from comment_actions where user_id=v_user and created_at >= v_start;
  else  return jsonb_build_object('ok', false, 'reason', 'bad_key'); end if;

  if v_cnt < v_goal then return jsonb_build_object('ok', false, 'reason', 'incomplete'); end if;

  insert into point_balances (user_id) values (v_user) on conflict (user_id) do nothing;
  begin
    insert into mission_claims (user_id, mission_key, claim_date, reward)
    values (v_user, p_key, v_today, v_reward);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end;

  update point_balances set balance = balance + v_reward, updated_at = now()
    where user_id = v_user returning balance into v_bal;
  insert into point_ledger (user_id, delta, reason) values (v_user, v_reward, 'mission:'||p_key);

  return jsonb_build_object('ok', true, 'reward', v_reward, 'balance', v_bal);
end $$;
