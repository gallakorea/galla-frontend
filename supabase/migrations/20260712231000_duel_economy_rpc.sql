-- ⚔️ 일기토 RPC: 스테이크 경제 + 실시간 흐름 + 노쇼/전적
-- 파라미터: stake ∈ {300,500,1000}, limit ∈ {180,300,600}, 투표 90s, 노쇼 유예 5m, 위약 200GP

-- 구 시그니처 제거(오버로드 충돌 방지)
drop function if exists public.duel_challenge(uuid, text);

-- 내부: 스테이크 잠금(차감). 성공 true / 잔액부족 false
create or replace function public._duel_lock_stake(p_user uuid, p_amt int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_bal double precision;
begin
  insert into point_balances(user_id) values (p_user) on conflict (user_id) do nothing;
  select balance into v_bal from point_balances where user_id = p_user for update;
  if coalesce(v_bal,0) < p_amt then return false; end if;
  update point_balances set balance = balance - p_amt, updated_at = now() where user_id = p_user;
  insert into point_ledger(user_id, delta, reason) values (p_user, -p_amt, 'duel_stake');
  return true;
end $$;

create or replace function public._duel_pay(p_user uuid, p_amt int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_amt = 0 then return; end if;
  insert into point_balances(user_id) values (p_user) on conflict (user_id) do nothing;
  update point_balances set balance = greatest(0, balance + p_amt), updated_at = now() where user_id = p_user;
  insert into point_ledger(user_id, delta, reason) values (p_user, p_amt, p_reason);
end $$;

-- 내부: 라이브 전환 + 관중 fan-out 알림
create or replace function public._duel_go_live(p_duel bigint)
returns void language plpgsql security definer set search_path = public as $$
declare d duels%rowtype; v_nick text;
begin
  select * into d from duels where id = p_duel for update;
  if d.status not in ('pending','scheduled') then return; end if;
  update duels set status='live', live_started_at=now(),
    live_ends_at = now() + make_interval(secs => d.time_limit_secs)
   where id = p_duel;
  select nickname into v_nick from users where id = d.challenger;
  -- 파이터 알림
  perform _duel_notify(d.challenger, d.opponent, 'duel_live', '일기토 개시! ⚔️ 링에 입장하세요', p_duel);
  perform _duel_notify(d.opponent, d.challenger, 'duel_live', '일기토 개시! ⚔️ 링에 입장하세요', p_duel);
  -- 관중 fan-out: 그 이슈 참여자(투표/댓글)에게
  if d.issue_id is not null then
    insert into notifications(user_id, type, from_user, message, link)
    select distinct u, d.challenger, 'duel_watch',
      '🔴 지금 일기토 생중계 — “'||left(d.topic,20)||'” 관전하러 가기', 'duel.html?id='||p_duel
    from (
      select user_id u from votes where issue_id = d.issue_id
      union select user_id from comments where issue_id = d.issue_id
    ) s
    where u is not null and u <> d.challenger and u <> d.opponent
    limit 500;
  end if;
end $$;

-- ============ 신청 ============
create or replace function public.duel_challenge(
  p_opponent uuid, p_topic text, p_issue_id bigint default null,
  p_stake int default 500, p_limit int default 300, p_scheduled_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_id bigint; v_nick text; v_mode text;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_opponent is null or p_opponent = v_user then return jsonb_build_object('ok',false,'reason','bad_opponent'); end if;
  if coalesce(btrim(p_topic),'') = '' then return jsonb_build_object('ok',false,'reason','no_topic'); end if;
  if p_stake not in (300,500,1000) then p_stake := 500; end if;
  if p_limit not in (180,300,600) then p_limit := 300; end if;
  v_mode := case when p_scheduled_at is null then 'instant' else 'scheduled' end;

  if exists (select 1 from duels
              where status in ('pending','scheduled','live','voting')
                and ((challenger=v_user and opponent=p_opponent) or (challenger=p_opponent and opponent=v_user))) then
    return jsonb_build_object('ok',false,'reason','already');
  end if;

  -- 잔액 → 티켓 → 차감 순 (부작용 전 검증)
  if (select coalesce(balance,0) from point_balances where user_id=v_user) < p_stake then
    return jsonb_build_object('ok',false,'reason','insufficient');
  end if;
  if not _consume_item(v_user, 'duel_ticket') then
    return jsonb_build_object('ok',false,'reason','no_ticket');
  end if;
  if not _duel_lock_stake(v_user, p_stake) then
    -- 티켓 롤백(같은 트랜잭션이지만 명시)
    insert into user_items(user_id,item_key,qty) values(v_user,'duel_ticket',1)
      on conflict (user_id,item_key) do update set qty=user_items.qty+1;
    return jsonb_build_object('ok',false,'reason','insufficient');
  end if;

  insert into duels(challenger, opponent, topic, status, issue_id, stake, time_limit_secs, mode, scheduled_at, turn)
    values(v_user, p_opponent, left(btrim(p_topic),140), 'pending', p_issue_id, p_stake, p_limit, v_mode, p_scheduled_at, null)
    returning id into v_id;

  select nickname into v_nick from users where id=v_user;
  perform _duel_notify(p_opponent, v_user, 'duel_challenge',
    coalesce(v_nick,'누군가')||'님이 '||p_stake||'GP 일기토를 신청했어요 ⚔️', v_id);
  return jsonb_build_object('ok',true,'id',v_id);
end $$;

-- ============ 수락 / 거절(도망) ============
create or replace function public.duel_respond(p_duel bigint, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); d duels%rowtype; v_nick text;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select * into d from duels where id=p_duel for update;
  if d.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if d.opponent <> v_user then return jsonb_build_object('ok',false,'reason','not_opponent'); end if;
  if d.status <> 'pending' then return jsonb_build_object('ok',false,'reason','not_pending'); end if;
  select nickname into v_nick from users where id=v_user;

  if p_accept then
    if not _duel_lock_stake(v_user, d.stake) then
      return jsonb_build_object('ok',false,'reason','insufficient');
    end if;
    if d.mode = 'instant' then
      perform _duel_go_live(p_duel);
      return jsonb_build_object('ok',true,'status','live');
    else
      update duels set status='scheduled', accepted_at=now(),
        grace_until = greatest(d.scheduled_at, now()) + interval '5 minutes' where id=p_duel;
      perform _duel_notify(d.challenger, v_user, 'duel_accept',
        coalesce(v_nick,'상대')||'님이 수락했어요 — 예약 시각에 입장하세요 ⏰', p_duel);
      return jsonb_build_object('ok',true,'status','scheduled');
    end if;
  else
    -- 도망: 도전자 스테이크 환불 + 위약 200 몰수(응전자→도전자) + 도망 기록
    perform _duel_pay(d.challenger, d.stake, 'duel_refund');
    perform _duel_pay(v_user, -200, 'duel_flee_penalty');
    perform _duel_pay(d.challenger, 200, 'duel_flee_comp');
    update duels set status='declined', result='flee', fled_by=v_user, closed_at=now() where id=p_duel;
    perform _duel_notify(d.challenger, v_user, 'duel_decline',
      coalesce(v_nick,'상대')||'님이 도망쳤어요! 위약금 +200GP 획득 🏳️', p_duel);
    return jsonb_build_object('ok',true,'status','declined');
  end if;
end $$;

-- ============ 예약 대결 입장 ============
create or replace function public.duel_enter(p_duel bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); d duels%rowtype;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select * into d from duels where id=p_duel for update;
  if d.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if d.status = 'live' then return jsonb_build_object('ok',true,'status','live'); end if;
  if d.status <> 'scheduled' then return jsonb_build_object('ok',false,'reason','not_scheduled'); end if;
  if v_user = d.challenger then update duels set chal_entered=true where id=p_duel;
  elsif v_user = d.opponent then update duels set opp_entered=true where id=p_duel;
  else return jsonb_build_object('ok',false,'reason','not_party'); end if;
  select * into d from duels where id=p_duel;
  if d.chal_entered and d.opp_entered then
    perform _duel_go_live(p_duel);
    return jsonb_build_object('ok',true,'status','live');
  end if;
  return jsonb_build_object('ok',true,'status','waiting');
end $$;

-- ============ 파이터 발화 ============
create or replace function public.duel_say(p_duel bigint, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); d duels%rowtype; v_side text;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if coalesce(btrim(p_body),'')='' then return jsonb_build_object('ok',false,'reason','empty'); end if;
  select * into d from duels where id=p_duel;
  if d.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if d.status <> 'live' then return jsonb_build_object('ok',false,'reason','not_live'); end if;
  if d.live_ends_at is not null and now() >= d.live_ends_at then
    perform duel_resolve(p_duel);
    return jsonb_build_object('ok',false,'reason','time_over');
  end if;
  if v_user = d.challenger then v_side:='challenger';
  elsif v_user = d.opponent then v_side:='opponent';
  else return jsonb_build_object('ok',false,'reason','not_fighter'); end if;
  insert into duel_messages(duel_id, user_id, side, body) values (p_duel, v_user, v_side, left(btrim(p_body),500));
  return jsonb_build_object('ok',true);
end $$;

-- ============ 관중 응원 ============
create or replace function public.duel_cheer(p_duel bigint, p_team text, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); d duels%rowtype;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if coalesce(btrim(p_body),'')='' then return jsonb_build_object('ok',false,'reason','empty'); end if;
  if coalesce(p_team,'neutral') not in ('challenger','opponent','neutral') then p_team:='neutral'; end if;
  select * into d from duels where id=p_duel;
  if d.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if d.status not in ('live','voting') then return jsonb_build_object('ok',false,'reason','closed'); end if;
  if v_user = d.challenger or v_user = d.opponent then return jsonb_build_object('ok',false,'reason','is_party'); end if;
  insert into duel_cheers(duel_id, user_id, team, body) values (p_duel, v_user, p_team, left(btrim(p_body),300));
  return jsonb_build_object('ok',true);
end $$;

-- ============ 관중 승자 투표 (live/voting 중) ============
create or replace function public.duel_vote(p_duel bigint, p_choice text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); d duels%rowtype;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_choice not in ('challenger','opponent') then return jsonb_build_object('ok',false,'reason','bad_choice'); end if;
  select * into d from duels where id=p_duel for update;
  if d.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if d.status not in ('live','voting') then return jsonb_build_object('ok',false,'reason','not_open'); end if;
  if v_user = d.challenger or v_user = d.opponent then return jsonb_build_object('ok',false,'reason','is_party'); end if;
  insert into duel_votes(duel_id, voter, choice) values (p_duel, v_user, p_choice)
    on conflict (duel_id, voter) do update set choice = excluded.choice;
  update duels set
    vote_challenger=(select count(*) from duel_votes where duel_id=p_duel and choice='challenger'),
    vote_opponent  =(select count(*) from duel_votes where duel_id=p_duel and choice='opponent')
  where id=p_duel;
  return jsonb_build_object('ok',true);
end $$;

-- ============ 판정 (멱등) ============
create or replace function public.duel_resolve(p_duel bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d duels%rowtype; v_c int; v_o int; v_res text; v_win uuid; v_pot int;
begin
  select * into d from duels where id=p_duel for update;
  if d.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if d.status = 'finished' then return jsonb_build_object('ok',true,'status','finished','result',d.result); end if;

  -- live 종료 → voting 개시(90s)
  if d.status = 'live' then
    if d.live_ends_at is null or now() < d.live_ends_at then
      return jsonb_build_object('ok',false,'reason','live','ends_at',d.live_ends_at);
    end if;
    update duels set status='voting', voting_ends_at = now() + interval '90 seconds' where id=p_duel;
    perform _duel_notify(d.challenger, null, 'duel_voting', '변론 종료 — 관중 투표 90초! 🗳️', p_duel);
    perform _duel_notify(d.opponent, null, 'duel_voting', '변론 종료 — 관중 투표 90초! 🗳️', p_duel);
    return jsonb_build_object('ok',true,'status','voting');
  end if;

  if d.status <> 'voting' then return jsonb_build_object('ok',false,'reason','not_voting'); end if;
  if d.voting_ends_at is null or now() < d.voting_ends_at then
    return jsonb_build_object('ok',false,'reason','too_early','ends_at',d.voting_ends_at);
  end if;

  select count(*) filter (where choice='challenger'), count(*) filter (where choice='opponent')
    into v_c, v_o from duel_votes where duel_id=p_duel;
  v_pot := d.stake * 2;
  if v_c > v_o then v_res:='challenger'; v_win:=d.challenger;
  elsif v_o > v_c then v_res:='opponent'; v_win:=d.opponent;
  else v_res:='draw'; v_win:=null; end if;

  update duels set status='finished', result=v_res, winner=v_win,
    vote_challenger=v_c, vote_opponent=v_o, closed_at=now() where id=p_duel;

  if v_res='draw' then
    perform _duel_pay(d.challenger, d.stake, 'duel_refund');
    perform _duel_pay(d.opponent,   d.stake, 'duel_refund');
    perform _duel_notify(d.challenger, null, 'duel_result', '일기토 무승부 — 판돈 환불 🤝', p_duel);
    perform _duel_notify(d.opponent,   null, 'duel_result', '일기토 무승부 — 판돈 환불 🤝', p_duel);
  else
    perform _duel_pay(v_win, v_pot, 'duel_win_pot');
    perform _duel_notify(v_win, null, 'duel_result', '일기토 승리! 🏆 판돈 +'||v_pot||'GP 획득', p_duel);
    perform _duel_notify(case when v_win=d.challenger then d.opponent else d.challenger end, null,
      'duel_result', '일기토 패배… 판돈을 잃었어요', p_duel);
  end if;
  return jsonb_build_object('ok',true,'status','finished','result',v_res);
end $$;

-- ============ 노쇼 체크 (예약 유예 초과) ============
create or replace function public.duel_noshow_check(p_duel bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d duels%rowtype; v_pot int;
begin
  select * into d from duels where id=p_duel for update;
  if d.id is null or d.status <> 'scheduled' then return jsonb_build_object('ok',false,'reason','n/a'); end if;
  if d.grace_until is null or now() < d.grace_until then return jsonb_build_object('ok',false,'reason','waiting'); end if;
  v_pot := d.stake * 2;
  if d.chal_entered and not d.opp_entered then
    perform _duel_pay(d.challenger, v_pot, 'duel_win_pot');
    update duels set status='noshow', result='challenger', winner=d.challenger, fled_by=d.opponent, closed_at=now() where id=p_duel;
    perform _duel_notify(d.challenger, null, 'duel_result', '상대 노쇼! 부전승 🏆 +'||v_pot||'GP', p_duel);
    perform _duel_notify(d.opponent, null, 'duel_result', '노쇼로 몰수패…', p_duel);
  elsif d.opp_entered and not d.chal_entered then
    perform _duel_pay(d.opponent, v_pot, 'duel_win_pot');
    update duels set status='noshow', result='opponent', winner=d.opponent, fled_by=d.challenger, closed_at=now() where id=p_duel;
    perform _duel_notify(d.opponent, null, 'duel_result', '상대 노쇼! 부전승 🏆 +'||v_pot||'GP', p_duel);
    perform _duel_notify(d.challenger, null, 'duel_result', '노쇼로 몰수패…', p_duel);
  else
    -- 둘 다 미입장 → 무효, 환불
    perform _duel_pay(d.challenger, d.stake, 'duel_refund');
    perform _duel_pay(d.opponent,   d.stake, 'duel_refund');
    update duels set status='expired', closed_at=now() where id=p_duel;
  end if;
  return jsonb_build_object('ok',true,'status','resolved');
end $$;

-- ============ 전적(도망 포함) ============
create or replace function public.duel_record(p_user uuid)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'wins',   count(*) filter (where status in ('finished','noshow') and winner = p_user),
    'losses', count(*) filter (where status in ('finished','noshow') and (challenger=p_user or opponent=p_user)
                                     and result <> 'draw' and winner is distinct from p_user
                                     and fled_by is distinct from p_user),
    'draws',  count(*) filter (where status='finished' and result='draw' and (challenger=p_user or opponent=p_user)),
    'flees',  count(*) filter (where fled_by = p_user)
  ) from duels;
$$;

grant execute on function public.duel_challenge(uuid,text,bigint,int,int,timestamptz) to authenticated;
grant execute on function public.duel_respond(bigint,boolean) to authenticated;
grant execute on function public.duel_enter(bigint)          to authenticated;
grant execute on function public.duel_say(bigint,text)       to authenticated;
grant execute on function public.duel_cheer(bigint,text,text) to authenticated;
grant execute on function public.duel_vote(bigint,text)      to authenticated;
grant execute on function public.duel_resolve(bigint)        to authenticated, anon;
grant execute on function public.duel_noshow_check(bigint)   to authenticated, anon;
grant execute on function public.duel_record(uuid)           to authenticated, anon;
