-- =========================================================
-- 일기토 업그레이드 1차: 골격 (2026-07-17, 사용자 확정)
--  ① 대결 최대 90초  ② 포기하기(항복)  ③ 응원 GP = 파리뮤추얼 배당
--
-- ★응원 GP 정책 준수: "GP 유저 간 이전(선물·양도) 금지 / 게임 루프의 이동은 허용"
--   → 응원 GP를 파이터에게 주면 '선물'이라 금지. 대신 갈라예측과 같은 파리뮤추얼로:
--     내 편에 걸고 → 이긴 편 응원자들이 진 편 풀을 투척비율로 분배.
--   → **무료 GP(balance)만** 받는다. 유료 충전분(paid_balance)은 예측·일기토 투입 금지
--     (사행성 모사 고리 차단, [[galla-monetization]]).
-- =========================================================

-- 1) 응원 베팅 원장
create table if not exists public.duel_cheer_bets (
  id         bigserial primary key,
  duel_id    bigint not null,
  user_id    uuid   not null,
  team       text   not null check (team in ('challenger','opponent')),
  amount     int    not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index if not exists dcb_duel_idx on public.duel_cheer_bets(duel_id);
create index if not exists dcb_user_idx on public.duel_cheer_bets(user_id);
alter table public.duel_cheer_bets enable row level security;
drop policy if exists dcb_read on public.duel_cheer_bets;
create policy dcb_read on public.duel_cheer_bets for select using (true);  -- 기세 게이지는 모두가 봄

alter table public.duels
  add column if not exists cheer_chal int not null default 0,   -- 도전자 편 응원 풀
  add column if not exists cheer_opp  int not null default 0,   -- 응전자 편 응원 풀
  add column if not exists cheer_paid boolean not null default false;  -- 배당 지급 완료(멱등)

-- 2) 🔥 응원 GP 투척 (live 중에만, 당사자 제외, 무료 GP만)
create or replace function public.duel_cheer_gp(p_duel bigint, p_team text, p_amount int)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); d duels%rowtype; v_bal numeric;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_team not in ('challenger','opponent') then return jsonb_build_object('ok',false,'reason','bad_team'); end if;
  if coalesce(p_amount,0) not in (10,50,100,500) then return jsonb_build_object('ok',false,'reason','bad_amount'); end if;

  select * into d from duels where id=p_duel for update;
  if d.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if d.status <> 'live' then return jsonb_build_object('ok',false,'reason','not_live'); end if;
  if v_user in (d.challenger, d.opponent) then return jsonb_build_object('ok',false,'reason','is_party'); end if;

  -- ★무료 GP만. 유료 충전분은 일기토 투입 금지(사행성 방화벽).
  select balance into v_bal from point_balances where user_id=v_user for update;
  if coalesce(v_bal,0) < p_amount then return jsonb_build_object('ok',false,'reason','insufficient'); end if;
  update point_balances set balance = balance - p_amount, updated_at=now() where user_id=v_user;
  insert into point_ledger(user_id, delta, reason) values (v_user, -p_amount, 'duel_cheer');

  insert into duel_cheer_bets(duel_id,user_id,team,amount) values (p_duel,v_user,p_team,p_amount);
  if p_team='challenger' then
    update duels set cheer_chal = cheer_chal + p_amount where id=p_duel;
  else
    update duels set cheer_opp = cheer_opp + p_amount where id=p_duel;
  end if;

  select * into d from duels where id=p_duel;
  return jsonb_build_object('ok',true,'chal',d.cheer_chal,'opp',d.cheer_opp);
end $$;

-- 3) 응원 배당 정산 — 이긴 편 응원자가 진 편 풀을 투척비율로 분배(멱등)
create or replace function public._duel_pay_cheers(p_duel bigint)
returns void language plpgsql security definer set search_path to 'public' as $$
declare d duels%rowtype; v_win text; v_win_pool int; v_lose_pool int; r record; v_share int;
begin
  select * into d from duels where id=p_duel for update;
  if d.cheer_paid then return; end if;
  update duels set cheer_paid = true where id = p_duel;

  -- 무승부/무효 → 전액 환불
  if d.winner is null then
    for r in select user_id, sum(amount) a from duel_cheer_bets where duel_id=p_duel group by user_id loop
      perform _duel_pay(r.user_id, r.a::int, 'duel_cheer_refund');
    end loop;
    return;
  end if;

  v_win := case when d.winner = d.challenger then 'challenger' else 'opponent' end;
  v_win_pool  := case when v_win='challenger' then d.cheer_chal else d.cheer_opp end;
  v_lose_pool := case when v_win='challenger' then d.cheer_opp  else d.cheer_chal end;

  if v_win_pool <= 0 then
    -- 이긴 편에 응원이 없으면 진 편 응원도 환불(몰수 대상 없음)
    for r in select user_id, sum(amount) a from duel_cheer_bets where duel_id=p_duel group by user_id loop
      perform _duel_pay(r.user_id, r.a::int, 'duel_cheer_refund');
    end loop;
    return;
  end if;

  -- 이긴 편: 원금 + 진 편 풀을 투척비율로
  for r in select user_id, sum(amount) a from duel_cheer_bets
            where duel_id=p_duel and team=v_win group by user_id loop
    v_share := r.a + floor(v_lose_pool::numeric * r.a / v_win_pool)::int;
    perform _duel_pay(r.user_id, v_share, 'duel_cheer_win');
    begin
      insert into notifications(user_id, from_user, type, message, link)
      values (r.user_id, null, 'duel_cheer_win',
              '🔥 응원한 편이 이겼어요! +'||v_share||' GP', 'duel.html?id='||p_duel);
    exception when others then null; end;
  end loop;
end $$;

-- 4) 🏳️ 포기하기 — live 중 항복. 상대 승리 + 판돈 이전 + 응원 정산까지.
create or replace function public.duel_forfeit(p_duel bigint)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); d duels%rowtype; v_win uuid; v_nick text;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select * into d from duels where id=p_duel for update;
  if d.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if v_user not in (d.challenger, d.opponent) then return jsonb_build_object('ok',false,'reason','not_fighter'); end if;
  if d.status <> 'live' then return jsonb_build_object('ok',false,'reason','not_live'); end if;

  v_win := case when v_user = d.challenger then d.opponent else d.challenger end;
  -- 판돈·알림·투표집계는 기존 _duel_finalize 규칙을 그대로 재사용(중복 구현 금지).
  -- 응원 배당은 status→finished 트리거가 자동 처리.
  perform _duel_finalize(p_duel, 'forfeit', v_win, 'forfeit', null);
  update duels set fled_by = v_user where id = p_duel;

  select nickname into v_nick from users where id=v_user;
  perform _duel_notify(v_win, v_user, 'duel_forfeit',
    coalesce(v_nick,'상대')||'님이 항복했어요! 부전승 🏆', p_duel);
  return jsonb_build_object('ok',true,'winner',v_win);
end $$;

-- 5) 기존 정산에 응원 배당 연결
-- ⚠️ _duel_finalize 는 원본이 훨씬 정교하다(투표수 집계·AI심판 문구 분기·환불/승리 알림).
--    통째로 재작성하면 기능이 퇴화하므로 건드리지 않고, 트리거로 응원 배당만 얹는다.
--    duels가 finished 로 바뀌는 모든 경로(_duel_finalize·duel_resolve·noshow 등)에서 자동 정산.
create or replace function public._trg_duel_pay_cheers()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status = 'finished' and coalesce(old.status,'') <> 'finished' and not coalesce(new.cheer_paid,false) then
    perform _duel_pay_cheers(new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_duel_pay_cheers on public.duels;
create trigger trg_duel_pay_cheers after update of status on public.duels
  for each row execute function _trg_duel_pay_cheers();

-- 6) 대결 시간 90초 상한 — duel_challenge의 허용값 교체
create or replace function public.duel_challenge(
  p_opponent uuid, p_topic text, p_issue_id bigint default null,
  p_stake integer default 500, p_limit integer default 90,
  p_scheduled_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare v_user uuid := auth.uid(); v_id bigint; v_nick text; v_mode text;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_opponent is null or p_opponent = v_user then return jsonb_build_object('ok',false,'reason','bad_opponent'); end if;
  if coalesce(btrim(p_topic),'') = '' then return jsonb_build_object('ok',false,'reason','no_topic'); end if;
  if p_stake not in (300,500,1000) then p_stake := 500; end if;
  -- ⚔️ 최대 90초(사용자 확정) — 짧고 굵게. 60/90만 허용.
  if p_limit not in (60,90) then p_limit := 90; end if;
  v_mode := case when p_scheduled_at is null then 'instant' else 'scheduled' end;

  if exists (select 1 from duels
              where status in ('pending','scheduled','live','voting')
                and ((challenger=v_user and opponent=p_opponent) or (challenger=p_opponent and opponent=v_user))) then
    return jsonb_build_object('ok',false,'reason','already');
  end if;
  if (select coalesce(balance,0) from point_balances where user_id=v_user) < p_stake then
    return jsonb_build_object('ok',false,'reason','insufficient');
  end if;
  if not _consume_item(v_user, 'duel_ticket') then
    return jsonb_build_object('ok',false,'reason','no_ticket');
  end if;
  if not _duel_lock_stake(v_user, p_stake) then
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
end $function$;

grant execute on function public.duel_cheer_gp(bigint,text,int) to authenticated;
grant execute on function public.duel_forfeit(bigint) to authenticated;
revoke all on function public.duel_cheer_gp(bigint,text,int) from anon;
revoke all on function public.duel_forfeit(bigint) from anon;
