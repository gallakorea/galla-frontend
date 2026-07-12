-- ⚖️ 일기토 AI 심판: 관중 무투표/동표 시 AI가 대화록을 읽고 승자 판정
-- resolve → 표 결판나면 관중판정, 0표/동표면 'judging' 상태로 대기 → 엣지함수가 AI 판정 적용

-- 상태에 judging 추가 + 판정 메타 컬럼
alter table public.duels drop constraint if exists duels_status_check;
alter table public.duels add constraint duels_status_check
  check (status in ('pending','scheduled','live','voting','judging','finished','declined','expired','noshow'));
alter table public.duels
  add column if not exists judge   text,   -- 'audience' | 'ai'
  add column if not exists verdict text;   -- AI 한줄 판정평

-- resolve 재작성: voting 종료 시 표 결판 → 관중판정 / 무표·동표 → judging
create or replace function public.duel_resolve(p_duel bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d duels%rowtype; v_c int; v_o int; v_tot int; v_res text; v_win uuid; v_pot int;
begin
  select * into d from duels where id=p_duel for update;
  if d.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if d.status = 'finished' then return jsonb_build_object('ok',true,'status','finished','result',d.result); end if;
  if d.status = 'judging' then return jsonb_build_object('ok',true,'status','judging','needs_ai',true); end if;

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
  v_tot := v_c + v_o;

  -- 관중이 결판(표차 존재) → 관중 판정
  if v_tot >= 1 and v_c <> v_o then
    if v_c > v_o then v_res:='challenger'; v_win:=d.challenger; else v_res:='opponent'; v_win:=d.opponent; end if;
    perform _duel_finalize(p_duel, v_res, v_win, 'audience', null);
    return jsonb_build_object('ok',true,'status','finished','result',v_res,'judge','audience');
  end if;

  -- 무표 또는 동표 → AI 심판 대기
  update duels set status='judging' where id=p_duel;
  return jsonb_build_object('ok',true,'status','judging','needs_ai',true);
end $$;

-- 공통 종결 처리(판정원=관중/AI 공용): 상태/승자/판돈 정산/알림
create or replace function public._duel_finalize(p_duel bigint, p_res text, p_win uuid, p_judge text, p_verdict text)
returns void language plpgsql security definer set search_path = public as $$
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
      case when p_judge='ai' then '🤖 AI 심판: 무승부 — 판돈 환불' else '무승부 — 판돈 환불 🤝' end, p_duel);
    perform _duel_notify(d.opponent, null, 'duel_result',
      case when p_judge='ai' then '🤖 AI 심판: 무승부 — 판돈 환불' else '무승부 — 판돈 환불 🤝' end, p_duel);
  else
    perform _duel_pay(p_win, v_pot, 'duel_win_pot');
    perform _duel_notify(p_win, null, 'duel_result',
      case when p_judge='ai' then '🤖 AI 심판 승리! 🏆 +'||v_pot||'GP' else '일기토 승리! 🏆 +'||v_pot||'GP' end, p_duel);
    perform _duel_notify(case when p_win=d.challenger then d.opponent else d.challenger end, null,
      'duel_result', case when p_judge='ai' then '🤖 AI 심판 패배…' else '일기토 패배…' end, p_duel);
  end if;
end $$;

-- AI 판정 적용 (엣지 함수 = service_role 만 호출) — judging 상태에서만
create or replace function public.duel_apply_ai_verdict(p_duel bigint, p_winner text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d duels%rowtype; v_res text; v_win uuid;
begin
  select * into d from duels where id=p_duel for update;
  if d.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if d.status = 'finished' then return jsonb_build_object('ok',true,'status','finished'); end if;
  if d.status <> 'judging' then return jsonb_build_object('ok',false,'reason','not_judging'); end if;
  if p_winner = 'challenger' then v_res:='challenger'; v_win:=d.challenger;
  elsif p_winner = 'opponent' then v_res:='opponent'; v_win:=d.opponent;
  else v_res:='draw'; v_win:=null; end if;
  perform _duel_finalize(p_duel, v_res, v_win, 'ai', left(coalesce(p_reason,''),300));
  return jsonb_build_object('ok',true,'status','finished','result',v_res);
end $$;

-- 판정 함수는 service_role 전용 (유저가 가짜 판정 주입 방지)
revoke all on function public.duel_apply_ai_verdict(bigint,text,text) from public, anon, authenticated;
revoke all on function public._duel_finalize(bigint,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.duel_resolve(bigint) to authenticated, anon;
