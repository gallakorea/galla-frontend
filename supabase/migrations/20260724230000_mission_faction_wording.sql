-- 미션 문구 정정: GALLA는 찬반이 아니라 진영 대결(사장님 지적).
-- daily_mission_status의 vote 미션 '찬반 투표 5회' → '진영 투표 5회', 아이콘 🗳️→🚩.
-- (본문은 20260724 기존 정의와 동일, title/icon만 변경)
create or replace function public.daily_mission_status()
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare
  v_user uuid := auth.uid();
  v_start timestamp := _kst_day_start();
  v_today date := _kst_today();
  v_votes int; v_comments int; v_battle int; v_bets int;
  v_res jsonb;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  select count(*) into v_votes    from votes           where user_id = v_user and created_at >= v_start;
  select count(*) into v_comments from comments        where user_id = v_user and created_at >= v_start;
  select count(*) into v_battle   from comment_actions where user_id = v_user and created_at >= v_start;
  select count(*) into v_bets     from predict_bets    where user_id = v_user and created_at >= v_start;
  v_res := jsonb_build_array(
    jsonb_build_object('key','vote','icon','🚩','title','진영 투표 5회','goal',5,'reward',200,
      'progress', least(v_votes,5), 'raw', v_votes,
      'claimed', exists(select 1 from mission_claims where user_id=v_user and mission_key='vote' and claim_date=v_today)),
    jsonb_build_object('key','comment','icon','💬','title','참전 댓글 3개','goal',3,'reward',300,
      'progress', least(v_comments,3), 'raw', v_comments,
      'claimed', exists(select 1 from mission_claims where user_id=v_user and mission_key='comment' and claim_date=v_today)),
    jsonb_build_object('key','battle','icon','⚔️','title','전투 액션 3회(공격·방어·지원)','goal',3,'reward',300,
      'progress', least(v_battle,3), 'raw', v_battle,
      'claimed', exists(select 1 from mission_claims where user_id=v_user and mission_key='battle' and claim_date=v_today)),
    jsonb_build_object('key','predict','icon','🎯','title','갈라예측 베팅 1회','goal',1,'reward',300,
      'progress', least(v_bets,1), 'raw', v_bets,
      'claimed', exists(select 1 from mission_claims where user_id=v_user and mission_key='predict' and claim_date=v_today))
  );
  return jsonb_build_object('ok', true, 'missions', v_res, 'today', v_today);
end $f$;
