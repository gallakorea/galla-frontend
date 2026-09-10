-- 스토어 용어 정책(사행성 금지어) — DB 함수가 사용자에게 돌려주는 문구에 남아 있던 금지어 치환.
-- 2026-09-10 QA: html/js/css 전수는 0건이었으나 DB 함수는 검사 밖이었다.
--   gacha_draw     : 1% 최고 보상 결과 「💎 잭팟! +5,000 GP」 → 「💎 대박 보너스! +5,000 GP」
--                    (확률 공개표는 이미 「대박 보너스」 — 결과창·배너만 「잭팟」이던 불일치도 해소)
--   _duel_finalize : 일기토 무승부 알림 「무승부 — 판돈 환불」 → 「무승부 — 대결 GP 환불」 (AI/사람 심판 각 2곳)
--   _mission_defs  : 미션 제목 「갈라예측 베팅 1회」「주간 예측 베팅 5회」 → 「… 참여 …」
-- 로직·확률·권한은 한 글자도 안 바꿨다 — pg_get_functiondef 원문에서 문자열 리터럴만 치환.

CREATE OR REPLACE FUNCTION public.gacha_draw()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  c_cost constant int := 700; c_daily constant int := 30;
  v_today int; v_bal double precision; v_roll double precision := random();
  v_type text; v_key text; v_gp int := 0; v_label text; v_grade text := 'common'; v_pick text;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select count(*) into v_today from gacha_pulls where user_id=v_user and created_at::date = current_date;
  if v_today >= c_daily then return jsonb_build_object('ok',false,'reason','daily_limit','limit',c_daily,'used',v_today); end if;
  v_bal := _gp_spend(v_user, c_cost);
  if v_bal is null then return jsonb_build_object('ok',false,'reason','insufficient'); end if;
  insert into point_ledger(user_id, delta, reason) values (v_user, -c_cost, 'gacha');

  if v_roll < 0.30 then v_type:='bust'; v_gp:=0; v_grade:='bust'; v_label:='🗑️ 꽝… 다음 기회에!';
  elsif v_roll < 0.50 then v_type:='gp'; v_gp:=100; v_label:='+100 GP';
  elsif v_roll < 0.66 then v_type:='gp'; v_gp:=300; v_label:='+300 GP';
  elsif v_roll < 0.79 then
    select k into v_pick from (select unnest(array['sticker_pack_2','sticker_pack_3']) k) t
      where not exists (select 1 from user_items where user_id=v_user and item_key=t.k and qty>0) order by random() limit 1;
    if v_pick is not null then
      insert into user_items(user_id,item_key,qty) values(v_user,v_pick,1)
        on conflict (user_id,item_key) do update set qty=user_items.qty+1;
      v_type:='sticker'; v_key:=v_pick; v_grade:='rare';
      v_label:= case v_pick when 'sticker_pack_2' then '🔥 감정폭발 스티커팩!' else '💢 정시밈 스티커팩!' end;
    else v_type:='gp'; v_gp:=400; v_label:='+400 GP'; end if;
  elsif v_roll < 0.88 then v_type:='gp'; v_gp:=1000; v_label:='+1,000 GP'; v_grade:='rare';
  elsif v_roll < 0.95 then v_type:='gp'; v_gp:=800; v_label:='+800 GP'; v_grade:='rare';
  elsif v_roll < 0.975 then
    select k into v_pick from (select unnest(array['ice','neon','toxic','fire','royal']) k) t
      where not exists (select 1 from user_nickstyles where user_id=v_user and style_key=t.k) order by random() limit 1;
    if v_pick is not null then
      insert into user_nickstyles(user_id,style_key) values(v_user,v_pick) on conflict do nothing;
      v_type:='nickstyle'; v_key:=v_pick; v_grade:='epic'; v_label:='🎨 닉 스타일 획득: '||(select name from _nickstyle_info(v_pick));
    else v_type:='gp'; v_gp:=1500; v_label:='+1,500 GP'; end if;
  elsif v_roll < 0.99 then v_type:='gp'; v_gp:=2000; v_label:='🔥 대박! +2,000 GP'; v_grade:='epic';
  else v_type:='gp'; v_gp:=5000; v_label:='💎 대박 보너스! +5,000 GP'; v_grade:='legendary';
  end if;

  -- 당첨 GP는 무료 지갑으로 (획득 재화 — 게임 사용 가능)
  if v_gp > 0 then
    update point_balances set balance = balance + v_gp, updated_at=now() where user_id=v_user;
    insert into point_ledger(user_id, delta, reason) values (v_user, v_gp, 'gacha_win');
  end if;
  insert into gacha_pulls(user_id, reward_type, reward_key, reward_gp) values (v_user, v_type, v_key, v_gp);
  select balance + paid_balance into v_bal from point_balances where user_id=v_user;
  return jsonb_build_object('ok',true,'type',v_type,'key',v_key,'gp',v_gp,'label',v_label,'grade',v_grade,
    'balance',round(v_bal),'used',v_today+1,'limit',c_daily);
end $function$;

CREATE OR REPLACE FUNCTION public._duel_finalize(p_duel bigint, p_res text, p_win uuid, p_judge text, p_verdict text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d duels%rowtype; v_pot int; v_c int; v_o int;
begin
  select * into d from duels where id=p_duel for update;
  if d.id is null or d.status = 'finished' then return; end if;
  select count(*) filter (where choice='challenger'), count(*) filter (where choice='opponent')
    into v_c, v_o from duel_votes where duel_id=p_duel;
  v_pot := d.stake * 2;
  update duels set status='finished', result=p_res, winner=p_win, judge=p_judge, verdict=p_verdict,
    vote_challenger=v_c, vote_opponent=v_o, closed_at=now() where id=p_duel;

  if p_res='draw' or p_win is null then
    perform _duel_pay(d.challenger, d.stake, 'duel_refund');
    perform _duel_pay(d.opponent,   d.stake, 'duel_refund');
    perform _duel_notify(d.challenger, null, 'duel_result',
      case when p_judge='ai' then '🤖 AI 심판: 무승부 — 대결 GP 환불' else '무승부 — 대결 GP 환불 🤝' end, p_duel);
    perform _duel_notify(d.opponent, null, 'duel_result',
      case when p_judge='ai' then '🤖 AI 심판: 무승부 — 대결 GP 환불' else '무승부 — 대결 GP 환불 🤝' end, p_duel);
  else
    perform _duel_pay(p_win, v_pot, 'duel_win_pot');
    perform _duel_notify(p_win, null, 'duel_result',
      case when p_judge='ai' then '🤖 AI 심판 승리! 🏆 +'||v_pot||'GP' else '일기토 승리! 🏆 +'||v_pot||'GP' end, p_duel);
    perform _duel_notify(case when p_win=d.challenger then d.opponent else d.challenger end, null,
      'duel_result', case when p_judge='ai' then '🤖 AI 심판 패배…' else '일기토 패배…' end, p_duel);
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public._mission_defs(p_scope text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_scope
    when 'daily' then '[
      {"key":"vote","action":"vote","icon":"🚩","title":"진영 투표 5회","goal":5,"reward":200},
      {"key":"comment","action":"comment","icon":"💬","title":"참전 댓글 3개","goal":3,"reward":300},
      {"key":"battle","action":"battle","icon":"⚔️","title":"전투 액션 3회(공격·방어·지원)","goal":3,"reward":300},
      {"key":"predict","action":"predict","icon":"🎯","title":"갈라예측 참여 1회","goal":1,"reward":300},
      {"key":"plaza","action":"plaza","icon":"📝","title":"광장에 글 1개 쓰기","goal":1,"reward":250},
      {"key":"dm","action":"dm","icon":"✉️","title":"친구와 DM 나누기","goal":1,"reward":150},
      {"key":"share","action":"share","icon":"📣","title":"내가 보낸 갈라 링크를 친구가 열기","goal":1,"reward":150}
    ]'::jsonb
    when 'weekly' then '[
      {"key":"w_vote","action":"vote","icon":"🚩","title":"주간 진영 투표 25회","goal":25,"reward":600},
      {"key":"w_comment","action":"comment","icon":"💬","title":"주간 참전 댓글 20개","goal":20,"reward":800},
      {"key":"w_battle","action":"battle","icon":"⚔️","title":"주간 전투 액션 20회","goal":20,"reward":800},
      {"key":"w_predict","action":"predict","icon":"🎯","title":"주간 예측 참여 5회","goal":5,"reward":1000},
      {"key":"w_plaza","action":"plaza","icon":"📝","title":"주간 광장 글 5개","goal":5,"reward":900}
    ]'::jsonb
    when 'special' then '[
      {"key":"special","action":"vote_comment","icon":"🔥","title":"이번 주 핫이슈 임무 — 투표+댓글 5회 참여","goal":5,"reward":80}
    ]'::jsonb
    else '[]'::jsonb
  end;
$function$;
