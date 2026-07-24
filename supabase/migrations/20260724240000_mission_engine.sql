-- =========================================================
-- 미션 엔진 고도화 — GALLA 기능 전반을 미션화(사장님: "기능 200% 활용")
--   · 데이터 기반: _mission_defs(정의) + _mission_count(활동 집계) 로 DRY
--   · 일간(daily) / 주간(weekly) / 스페셜(special) / 오늘의 상자(chest)
--   · 보상 GP는 기존 방식과 동일하게 point_balances.balance(적립분) + point_ledger 기록
--   · mission_claims PK(user_id,mission_key,claim_date): 일간=오늘 / 주간·스페셜=그 주 월요일
-- =========================================================

-- KST 주 시작(월요일 00:00 KST → UTC 타임스탬프) / 주 날짜
create or replace function public._kst_week_start() returns timestamp language sql stable as $$
  select ((date_trunc('week', (now() at time zone 'Asia/Seoul'))::timestamp at time zone 'Asia/Seoul') at time zone 'UTC');
$$;
create or replace function public._kst_week_date() returns date language sql stable as $$
  select date_trunc('week', (now() at time zone 'Asia/Seoul'))::date;
$$;

-- 활동 집계(미션 소재 = 우리 기능들). action 키 → 테이블/컬럼 매핑 단일화.
create or replace function public._mission_count(p_user uuid, p_action text, p_since timestamp)
returns int language plpgsql stable security definer set search_path=public as $$
declare n int;
begin
  case p_action
    when 'vote'         then select count(*) into n from votes           where user_id=p_user  and created_at>=p_since;
    when 'comment'      then select count(*) into n from comments        where user_id=p_user  and created_at>=p_since;
    when 'battle'       then select count(*) into n from comment_actions where user_id=p_user  and created_at>=p_since;
    when 'predict'      then select count(*) into n from predict_bets    where user_id=p_user  and created_at>=p_since;
    when 'plaza'        then select count(*) into n from plaza_posts     where user_id=p_user  and created_at>=p_since;
    when 'dm'           then select count(*) into n from dm_messages     where sender_id=p_user and created_at>=p_since;
    when 'bookmark'     then select count(*) into n from bookmarks       where user_id=p_user  and created_at>=p_since;
    when 'plaza_comment'then select count(*) into n from plaza_comments  where user_id=p_user  and created_at>=p_since;
    when 'vote_comment' then select (select count(*) from votes    where user_id=p_user and created_at>=p_since)
                                  + (select count(*) from comments where user_id=p_user and created_at>=p_since) into n;
    else n := 0;
  end case;
  return coalesce(n,0);
end $$;

-- 미션 정의(스코프별). 여기만 고치면 미션 추가/조정 가능.
create or replace function public._mission_defs(p_scope text) returns jsonb language sql immutable as $$
  select case p_scope
    when 'daily' then '[
      {"key":"vote","action":"vote","icon":"🚩","title":"진영 투표 5회","goal":5,"reward":200},
      {"key":"comment","action":"comment","icon":"💬","title":"참전 댓글 3개","goal":3,"reward":300},
      {"key":"battle","action":"battle","icon":"⚔️","title":"전투 액션 3회(공격·방어·지원)","goal":3,"reward":300},
      {"key":"predict","action":"predict","icon":"🎯","title":"갈라예측 베팅 1회","goal":1,"reward":300},
      {"key":"plaza","action":"plaza","icon":"📝","title":"광장에 글 1개 쓰기","goal":1,"reward":250},
      {"key":"dm","action":"dm","icon":"✉️","title":"친구와 DM 나누기","goal":1,"reward":150}
    ]'::jsonb
    when 'weekly' then '[
      {"key":"w_vote","action":"vote","icon":"🚩","title":"주간 진영 투표 25회","goal":25,"reward":600},
      {"key":"w_comment","action":"comment","icon":"💬","title":"주간 참전 댓글 20개","goal":20,"reward":800},
      {"key":"w_battle","action":"battle","icon":"⚔️","title":"주간 전투 액션 20회","goal":20,"reward":800},
      {"key":"w_predict","action":"predict","icon":"🎯","title":"주간 예측 베팅 5회","goal":5,"reward":1000},
      {"key":"w_plaza","action":"plaza","icon":"📝","title":"주간 광장 글 5개","goal":5,"reward":900}
    ]'::jsonb
    when 'special' then '[
      {"key":"special","action":"vote_comment","icon":"🔥","title":"이번 주 핫이슈 임무 — 투표+댓글 5회 참여","goal":5,"reward":80}
    ]'::jsonb
    else '[]'::jsonb
  end;
$$;

-- 스코프의 미션 배열 빌드(정의 + 진행도 + 수령여부)
create or replace function public._mission_build(p_scope text, p_since timestamp, p_claim_date date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_user uuid := auth.uid(); d jsonb; arr jsonb := '[]'::jsonb; cnt int; g int;
begin
  if v_user is null then return arr; end if;
  for d in select * from jsonb_array_elements(_mission_defs(p_scope)) loop
    cnt := _mission_count(v_user, d->>'action', p_since);
    g   := (d->>'goal')::int;
    arr := arr || jsonb_build_array(jsonb_build_object(
      'key', d->>'key', 'icon', d->>'icon', 'title', d->>'title',
      'goal', g, 'reward', (d->>'reward')::int,
      'progress', least(cnt, g), 'raw', cnt,
      'claimed', exists(select 1 from mission_claims where user_id=v_user and mission_key=(d->>'key') and claim_date=p_claim_date)));
  end loop;
  return arr;
end $$;

-- 일간 상태(+오늘 상자 개봉 여부)
create or replace function public.daily_mission_status() returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_user uuid := auth.uid(); v_today date := _kst_today();
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  return jsonb_build_object('ok',true,'today',v_today,
    'missions', _mission_build('daily', _kst_day_start(), v_today),
    'chest_opened', exists(select 1 from mission_claims where user_id=v_user and mission_key='chest' and claim_date=v_today));
end $$;

-- 주간 상태
create or replace function public.weekly_mission_status() returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  return jsonb_build_object('ok',true,'week',_kst_week_date(),
    'missions', _mission_build('weekly', _kst_week_start(), _kst_week_date()));
end $$;

-- 스페셜 이벤트 상태(단일)
create or replace function public.special_event_status() returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_user uuid := auth.uid(); m jsonb;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  m := _mission_build('special', _kst_week_start(), _kst_week_date());
  return jsonb_build_object('ok',true,'week',_kst_week_date(),'event', m->0);
end $$;

-- 통합 수령 — 일간/주간/스페셜 모든 키를 처리
create or replace function public.claim_mission(p_key text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_user uuid := auth.uid(); d jsonb; v_scope text; v_since timestamp; v_cdate date;
  v_goal int; v_reward int; v_cnt int; v_bal double precision;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  d := null;
  foreach v_scope in array array['daily','weekly','special'] loop
    select e into d from jsonb_array_elements(_mission_defs(v_scope)) e where e->>'key'=p_key;
    if d is not null then exit; end if;
  end loop;
  if d is null then return jsonb_build_object('ok',false,'reason','bad_key'); end if;

  if v_scope='daily' then v_since := _kst_day_start(); v_cdate := _kst_today();
  else                    v_since := _kst_week_start(); v_cdate := _kst_week_date(); end if;
  v_goal := (d->>'goal')::int; v_reward := (d->>'reward')::int;
  v_cnt := _mission_count(v_user, d->>'action', v_since);
  if v_cnt < v_goal then return jsonb_build_object('ok',false,'reason','incomplete'); end if;

  insert into point_balances (user_id) values (v_user) on conflict (user_id) do nothing;
  begin
    insert into mission_claims (user_id, mission_key, claim_date, reward) values (v_user, p_key, v_cdate, v_reward);
  exception when unique_violation then return jsonb_build_object('ok',false,'reason','already'); end;
  update point_balances set balance = balance + v_reward, updated_at = now() where user_id=v_user returning balance into v_bal;
  insert into point_ledger (user_id, delta, reason) values (v_user, v_reward, 'mission:'||p_key);
  return jsonb_build_object('ok',true,'reward',v_reward,'balance',v_bal);
end $$;

-- 오늘의 상자 — 하루 1회 랜덤 GP(20~150)
create or replace function public.claim_daily_chest() returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_user uuid := auth.uid(); v_today date := _kst_today(); v_reward int; v_bal double precision;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  v_reward := 20 + floor(random()*131)::int; -- 20~150
  insert into point_balances (user_id) values (v_user) on conflict (user_id) do nothing;
  begin
    insert into mission_claims (user_id, mission_key, claim_date, reward) values (v_user, 'chest', v_today, v_reward);
  exception when unique_violation then return jsonb_build_object('ok',false,'reason','already'); end;
  update point_balances set balance = balance + v_reward, updated_at = now() where user_id=v_user returning balance into v_bal;
  insert into point_ledger (user_id, delta, reason) values (v_user, v_reward, 'daily_chest');
  return jsonb_build_object('ok',true,'reward',v_reward,'balance',v_bal);
end $$;

grant execute on function public._kst_week_start(), public._kst_week_date() to authenticated, anon;
grant execute on function public.weekly_mission_status(), public.special_event_status(), public.claim_daily_chest() to authenticated;
