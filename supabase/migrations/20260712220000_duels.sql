-- ⚔️ 일기토(1:1 논쟁 대결) 시스템
-- 진행: 비동기 3라운드 턴제(양측 번갈아 주장) → 관중 투표 24h → 승자 판정 + GP 보상
-- duel_ticket 소비로 신청. 상대 수락 시 시작. 거절/만료 시 티켓 환불.

-- ============ 테이블 ============
create table if not exists public.duels (
  id bigint generated always as identity primary key,
  challenger uuid not null,
  opponent   uuid not null,
  topic      text not null,
  status     text not null default 'pending'
             check (status in ('pending','active','voting','finished','declined','expired')),
  rounds     int  not null default 3,
  turn       uuid,                       -- 지금 주장을 올릴 차례인 유저
  winner     uuid,
  result     text,                       -- 'challenger' | 'opponent' | 'draw'
  vote_challenger int not null default 0,
  vote_opponent   int not null default 0,
  voting_ends_at  timestamptz,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  closed_at   timestamptz
);
alter table public.duels enable row level security;
drop policy if exists duels_read on public.duels;
create policy duels_read on public.duels for select using (true);
create index if not exists duels_status_idx on public.duels(status, created_at desc);
create index if not exists duels_parties_idx on public.duels(challenger, opponent);

create table if not exists public.duel_rounds (
  id bigint generated always as identity primary key,
  duel_id  bigint not null references public.duels(id) on delete cascade,
  user_id  uuid not null,
  side     text not null check (side in ('challenger','opponent')),
  round_no int  not null,
  body     text not null,
  created_at timestamptz not null default now()
);
alter table public.duel_rounds enable row level security;
drop policy if exists duel_rounds_read on public.duel_rounds;
create policy duel_rounds_read on public.duel_rounds for select using (true);
create index if not exists duel_rounds_duel_idx on public.duel_rounds(duel_id, created_at);

create table if not exists public.duel_votes (
  duel_id bigint not null references public.duels(id) on delete cascade,
  voter   uuid not null,
  choice  text not null check (choice in ('challenger','opponent')),
  created_at timestamptz not null default now(),
  primary key (duel_id, voter)
);
alter table public.duel_votes enable row level security;
drop policy if exists duel_votes_read on public.duel_votes;
create policy duel_votes_read on public.duel_votes for select using (true);

-- ============ 알림 헬퍼 ============
create or replace function public._duel_notify(p_to uuid, p_from uuid, p_type text, p_msg text, p_duel bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_to is null or p_to = p_from then return; end if;
  insert into notifications (user_id, type, from_user, message, link)
    values (p_to, p_type, p_from, p_msg, 'duel.html?id='||p_duel);
exception when others then null;
end $$;

-- ============ 신청 ============
create or replace function public.duel_challenge(p_opponent uuid, p_topic text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_id bigint; v_nick text;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_opponent is null or p_opponent = v_user then return jsonb_build_object('ok',false,'reason','bad_opponent'); end if;
  if coalesce(btrim(p_topic),'') = '' then return jsonb_build_object('ok',false,'reason','no_topic'); end if;
  -- 같은 상대와 미완료 일기토가 이미 있으면 중복 방지
  if exists (select 1 from duels
              where status in ('pending','active','voting')
                and ((challenger=v_user and opponent=p_opponent) or (challenger=p_opponent and opponent=v_user))) then
    return jsonb_build_object('ok',false,'reason','already');
  end if;
  -- 티켓 소비
  if not _consume_item(v_user, 'duel_ticket') then
    return jsonb_build_object('ok',false,'reason','no_ticket');
  end if;

  insert into duels (challenger, opponent, topic, status, turn)
    values (v_user, p_opponent, left(btrim(p_topic),140), 'pending', v_user)
    returning id into v_id;

  select nickname into v_nick from users where id = v_user;
  perform _duel_notify(p_opponent, v_user, 'duel_challenge',
    coalesce(v_nick,'누군가')||'님이 일기토를 신청했어요 ⚔️', v_id);
  return jsonb_build_object('ok',true,'id',v_id);
end $$;

-- ============ 수락 / 거절 ============
create or replace function public.duel_respond(p_duel bigint, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); d duels%rowtype; v_nick text;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select * into d from duels where id = p_duel for update;
  if d.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if d.opponent <> v_user then return jsonb_build_object('ok',false,'reason','not_opponent'); end if;
  if d.status <> 'pending' then return jsonb_build_object('ok',false,'reason','not_pending'); end if;

  select nickname into v_nick from users where id = v_user;
  if p_accept then
    update duels set status='active', accepted_at=now(), turn=challenger where id=p_duel;
    perform _duel_notify(d.challenger, v_user, 'duel_accept',
      coalesce(v_nick,'상대')||'님이 일기토를 수락했어요! 첫 주장을 올리세요 ⚔️', p_duel);
    return jsonb_build_object('ok',true,'status','active');
  else
    update duels set status='declined', closed_at=now() where id=p_duel;
    -- 티켓 환불
    insert into user_items (user_id, item_key, qty) values (d.challenger,'duel_ticket',1)
      on conflict (user_id,item_key) do update set qty = user_items.qty + 1, updated_at=now();
    perform _duel_notify(d.challenger, v_user, 'duel_decline',
      coalesce(v_nick,'상대')||'님이 일기토를 거절했어요 (티켓 환불)', p_duel);
    return jsonb_build_object('ok',true,'status','declined');
  end if;
end $$;

-- ============ 주장 제출(턴제) ============
create or replace function public.duel_argue(p_duel bigint, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); d duels%rowtype;
  v_side text; v_my_cnt int; v_opp_id uuid; v_round int; v_nick text; v_next uuid;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if coalesce(btrim(p_body),'') = '' then return jsonb_build_object('ok',false,'reason','empty'); end if;
  select * into d from duels where id = p_duel for update;
  if d.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if d.status <> 'active' then return jsonb_build_object('ok',false,'reason','not_active'); end if;
  if v_user <> d.challenger and v_user <> d.opponent then return jsonb_build_object('ok',false,'reason','not_party'); end if;
  if d.turn is distinct from v_user then return jsonb_build_object('ok',false,'reason','not_your_turn'); end if;

  if v_user = d.challenger then v_side:='challenger'; v_opp_id:=d.opponent; v_next:=d.opponent;
  else v_side:='opponent'; v_opp_id:=d.challenger; v_next:=d.challenger; end if;

  select count(*) into v_my_cnt from duel_rounds where duel_id=p_duel and user_id=v_user;
  if v_my_cnt >= d.rounds then return jsonb_build_object('ok',false,'reason','done'); end if;
  v_round := v_my_cnt + 1;

  insert into duel_rounds (duel_id, user_id, side, round_no, body)
    values (p_duel, v_user, v_side, v_round, left(btrim(p_body),1000));

  -- 양측 모두 rounds회 채우면 투표 단계로
  if (select count(*) from duel_rounds where duel_id=p_duel) >= d.rounds*2 then
    update duels set status='voting', turn=null, voting_ends_at = now() + interval '24 hours' where id=p_duel;
    select nickname into v_nick from users where id=v_user;
    perform _duel_notify(d.challenger, v_user, 'duel_voting', '일기토 변론 종료 — 관중 투표가 시작됐어요 🗳️', p_duel);
    perform _duel_notify(d.opponent,   v_user, 'duel_voting', '일기토 변론 종료 — 관중 투표가 시작됐어요 🗳️', p_duel);
    return jsonb_build_object('ok',true,'status','voting');
  else
    update duels set turn = v_next where id=p_duel;
    select nickname into v_nick from users where id=v_user;
    perform _duel_notify(v_opp_id, v_user, 'duel_turn',
      coalesce(v_nick,'상대')||'님이 반론했어요 — 당신 차례입니다 ⚔️', p_duel);
    return jsonb_build_object('ok',true,'status','active','round',v_round);
  end if;
end $$;

-- ============ 관중 투표 ============
create or replace function public.duel_vote(p_duel bigint, p_choice text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); d duels%rowtype;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_choice not in ('challenger','opponent') then return jsonb_build_object('ok',false,'reason','bad_choice'); end if;
  select * into d from duels where id=p_duel for update;
  if d.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if d.status <> 'voting' then return jsonb_build_object('ok',false,'reason','not_voting'); end if;
  if v_user = d.challenger or v_user = d.opponent then return jsonb_build_object('ok',false,'reason','is_party'); end if;

  insert into duel_votes (duel_id, voter, choice) values (p_duel, v_user, p_choice)
    on conflict (duel_id, voter) do nothing;
  if not found then return jsonb_build_object('ok',false,'reason','already_voted'); end if;

  update duels set
    vote_challenger = (select count(*) from duel_votes where duel_id=p_duel and choice='challenger'),
    vote_opponent   = (select count(*) from duel_votes where duel_id=p_duel and choice='opponent')
  where id=p_duel;
  return jsonb_build_object('ok',true);
end $$;

-- ============ 판정 (투표 종료 후 누구나/크론 호출 · 멱등) ============
create or replace function public.duel_resolve(p_duel bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d duels%rowtype; v_c int; v_o int; v_res text; v_win uuid;
begin
  select * into d from duels where id=p_duel for update;
  if d.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if d.status = 'finished' then
    return jsonb_build_object('ok',true,'status','finished','result',d.result);
  end if;
  if d.status <> 'voting' then return jsonb_build_object('ok',false,'reason','not_voting'); end if;
  if d.voting_ends_at is null or now() < d.voting_ends_at then
    return jsonb_build_object('ok',false,'reason','too_early','ends_at',d.voting_ends_at);
  end if;

  select count(*) filter (where choice='challenger'),
         count(*) filter (where choice='opponent')
    into v_c, v_o from duel_votes where duel_id=p_duel;

  if v_c > v_o then v_res:='challenger'; v_win:=d.challenger;
  elsif v_o > v_c then v_res:='opponent'; v_win:=d.opponent;
  else v_res:='draw'; v_win:=null; end if;

  update duels set status='finished', result=v_res, winner=v_win,
    vote_challenger=v_c, vote_opponent=v_o, closed_at=now() where id=p_duel;

  -- 보상: 승자 500 / 참가 100 / 무승부 양측 250
  if v_res='draw' then
    perform _award(d.challenger, 250, 'duel_result', 10);
    perform _award(d.opponent,   250, 'duel_result', 10);
  else
    perform _award(v_win, 500, 'duel_result', 10);
    perform _award(case when v_win=d.challenger then d.opponent else d.challenger end, 100, 'duel_result', 10);
  end if;

  perform _duel_notify(d.challenger, null, 'duel_result',
    case when v_res='draw' then '일기토 무승부! (+250 GP)'
         when v_win=d.challenger then '일기토 승리! 🏆 (+500 GP)' else '일기토 패배… (+100 GP)' end, p_duel);
  perform _duel_notify(d.opponent, null, 'duel_result',
    case when v_res='draw' then '일기토 무승부! (+250 GP)'
         when v_win=d.opponent then '일기토 승리! 🏆 (+500 GP)' else '일기토 패배… (+100 GP)' end, p_duel);

  return jsonb_build_object('ok',true,'status','finished','result',v_res);
end $$;

-- ============ 전적 조회 ============
create or replace function public.duel_record(p_user uuid)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'wins',   count(*) filter (where winner = p_user),
    'losses', count(*) filter (where status='finished' and result<>'draw' and winner is distinct from p_user
                                     and (challenger=p_user or opponent=p_user)),
    'draws',  count(*) filter (where status='finished' and result='draw' and (challenger=p_user or opponent=p_user)),
    'total',  count(*) filter (where status='finished' and (challenger=p_user or opponent=p_user))
  ) from duels;
$$;

grant execute on function public.duel_challenge(uuid,text)  to authenticated;
grant execute on function public.duel_respond(bigint,boolean) to authenticated;
grant execute on function public.duel_argue(bigint,text)    to authenticated;
grant execute on function public.duel_vote(bigint,text)     to authenticated;
grant execute on function public.duel_resolve(bigint)       to authenticated, anon;
grant execute on function public.duel_record(uuid)          to authenticated, anon;
