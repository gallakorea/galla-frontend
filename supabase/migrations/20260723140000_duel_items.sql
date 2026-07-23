-- =========================================================
-- ⚔️ 일기토 고도화 아이템 4종 (2026-07-23, 사용자 확정)
--  ① ⏱️ 시간 연장권  ② 🎤 결정타(하이라이트 발화)
--  ③ 🔁 설욕전(재대결)권  ④ 📢 관중 응원 부스트
--  ★모두 무료 GP만(예측·일기토에 유료충전 GP 금지 — 사행성 방화벽 준수)
--  ★아이템 구매는 _gp_spend(유료 우선 소각형 아님, 게임아이템은 balance)로 별도. 여기선
--    소비(_consume_item)만 다룬다. 상점 등록/가격은 프론트 items.js + buy_item RPC가 담당.
-- =========================================================

-- ── 컬럼: 1회성 사용 추적 + 하이라이트 + 부스트 ──
alter table public.duels
  add column if not exists chal_extended boolean not null default false,   -- 도전자 시간연장 사용
  add column if not exists opp_extended  boolean not null default false,   -- 응전자 시간연장 사용
  add column if not exists chal_finisher boolean not null default false,   -- 도전자 결정타 사용
  add column if not exists opp_finisher  boolean not null default false;   -- 응전자 결정타 사용
alter table public.duel_messages
  add column if not exists is_finisher boolean not null default false;     -- 🎤 결정타 발화
alter table public.duel_cheer_bets
  add column if not exists boost numeric not null default 1;               -- 📢 응원 부스트 배율(1 또는 1.7)

-- 기존 2·3인자 버전 제거 — 아래서 default 인자 추가판으로 재정의하면 오버로드가 모호해진다
drop function if exists public.duel_say(bigint, text);
drop function if exists public.duel_cheer_gp(bigint, text, int);


-- ①======== ⏱️ 시간 연장권 — 라이브 중 파이터가 1회 +60초 ========
create or replace function public.duel_extend_time(p_duel bigint)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); d duels%rowtype; v_is_chal boolean; v_used boolean; v_nick text;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select * into d from duels where id=p_duel for update;
  if d.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if d.status <> 'live' then return jsonb_build_object('ok',false,'reason','not_live'); end if;
  if v_user = d.challenger then v_is_chal := true; v_used := d.chal_extended;
  elsif v_user = d.opponent then v_is_chal := false; v_used := d.opp_extended;
  else return jsonb_build_object('ok',false,'reason','not_fighter'); end if;
  if v_used then return jsonb_build_object('ok',false,'reason','already_extended'); end if;
  if not _consume_item(v_user, 'duel_extend_pass', p_duel) then
    return jsonb_build_object('ok',false,'reason','no_item');
  end if;

  update duels set
    live_ends_at = coalesce(live_ends_at, now()) + interval '60 seconds',
    chal_extended = chal_extended or v_is_chal,
    opp_extended  = opp_extended  or (not v_is_chal)
  where id = p_duel;

  select nickname into v_nick from users where id=v_user;
  perform _duel_notify(case when v_is_chal then d.opponent else d.challenger end, v_user,
    'duel_extend', coalesce(v_nick,'상대')||'님이 ⏱️ 시간을 60초 연장했어요!', p_duel);

  select * into d from duels where id=p_duel;
  return jsonb_build_object('ok',true,'live_ends_at', d.live_ends_at);
end $$;


-- ②======== 🎤 결정타 — duel_say 확장(p_finisher). 1회, 하이라이트 발화 ========
create or replace function public.duel_say(p_duel bigint, p_body text, p_finisher boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); d duels%rowtype; v_side text; v_is_chal boolean; v_used boolean;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if coalesce(btrim(p_body),'')='' then return jsonb_build_object('ok',false,'reason','empty'); end if;
  select * into d from duels where id=p_duel for update;
  if d.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if d.status <> 'live' then return jsonb_build_object('ok',false,'reason','not_live'); end if;
  if d.live_ends_at is not null and now() >= d.live_ends_at then
    perform duel_resolve(p_duel);
    return jsonb_build_object('ok',false,'reason','time_over');
  end if;
  if v_user = d.challenger then v_side:='challenger'; v_is_chal:=true; v_used:=d.chal_finisher;
  elsif v_user = d.opponent then v_side:='opponent'; v_is_chal:=false; v_used:=d.opp_finisher;
  else return jsonb_build_object('ok',false,'reason','not_fighter'); end if;

  if p_finisher then
    if v_used then return jsonb_build_object('ok',false,'reason','finisher_used'); end if;
    if not _consume_item(v_user, 'duel_finisher_pass', p_duel) then
      return jsonb_build_object('ok',false,'reason','no_finisher'); end if;
    update duels set chal_finisher = chal_finisher or v_is_chal,
                     opp_finisher  = opp_finisher  or (not v_is_chal) where id=p_duel;
  end if;

  insert into duel_messages(duel_id, user_id, side, body, is_finisher)
    values (p_duel, v_user, v_side, left(btrim(p_body),500), p_finisher);
  return jsonb_build_object('ok',true,'finisher',p_finisher);
end $$;


-- ③======== 🔁 설욕전(재대결)권 — 끝난 판의 패자가 같은 상대·주제로 즉시 재도전 ========
create or replace function public.duel_rematch(p_duel bigint)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); d duels%rowtype; v_foe uuid; v_id bigint; v_nick text;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select * into d from duels where id=p_duel;
  if d.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if d.status not in ('finished','noshow','declined') then return jsonb_build_object('ok',false,'reason','not_over'); end if;
  if v_user not in (d.challenger, d.opponent) then return jsonb_build_object('ok',false,'reason','not_party'); end if;
  v_foe := case when v_user = d.challenger then d.opponent else d.challenger end;

  -- 이미 진행 중인 재대결/일기토 있으면 중복 방지
  if exists (select 1 from duels where status in ('pending','scheduled','live','voting','judging')
              and ((challenger=v_user and opponent=v_foe) or (challenger=v_foe and opponent=v_user))) then
    return jsonb_build_object('ok',false,'reason','already');
  end if;
  -- 판돈 잔액 확인
  if (select coalesce(balance,0) from point_balances where user_id=v_user) < d.stake then
    return jsonb_build_object('ok',false,'reason','insufficient');
  end if;
  -- 설욕전권 소비(없으면 실패 → 프론트가 구매 유도)
  if not _consume_item(v_user, 'duel_rematch_pass', p_duel) then
    return jsonb_build_object('ok',false,'reason','no_rematch'); end if;
  -- 판돈 잠금
  if not _duel_lock_stake(v_user, d.stake) then
    insert into user_items(user_id,item_key,qty) values(v_user,'duel_rematch_pass',1)
      on conflict (user_id,item_key) do update set qty=user_items.qty+1;
    return jsonb_build_object('ok',false,'reason','insufficient');
  end if;

  insert into duels(challenger, opponent, topic, status, issue_id, stake, time_limit_secs, mode, turn)
    values(v_user, v_foe, d.topic, 'pending', d.issue_id, d.stake, coalesce(d.time_limit_secs,90), 'instant', null)
    returning id into v_id;
  select nickname into v_nick from users where id=v_user;
  perform _duel_notify(v_foe, v_user, 'duel_challenge',
    coalesce(v_nick,'상대')||'님이 🔁 설욕전을 신청했어요! '||d.stake||'GP ⚔️', v_id);
  return jsonb_build_object('ok',true,'id',v_id);
end $$;


-- ④======== 📢 관중 응원 부스트 — duel_cheer_gp 확장(p_boost). 베팅 지분 1.7배 가중 ========
create or replace function public.duel_cheer_gp(p_duel bigint, p_team text, p_amount int, p_boost boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); d duels%rowtype; v_bal numeric; v_mult numeric := 1;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_team not in ('challenger','opponent') then return jsonb_build_object('ok',false,'reason','bad_team'); end if;
  if coalesce(p_amount,0) not in (10,50,100,500) then return jsonb_build_object('ok',false,'reason','bad_amount'); end if;
  select * into d from duels where id=p_duel for update;
  if d.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if d.status <> 'live' then return jsonb_build_object('ok',false,'reason','not_live'); end if;
  if v_user in (d.challenger, d.opponent) then return jsonb_build_object('ok',false,'reason','is_party'); end if;

  -- 📢 부스트권 소비 시 배당 지분 1.7배(원금은 그대로, 진 편 풀에서 더 큰 몫)
  if p_boost then
    if _consume_item(v_user, 'duel_cheer_boost', p_duel) then v_mult := 1.7; end if;
  end if;

  select balance into v_bal from point_balances where user_id=v_user for update;
  if coalesce(v_bal,0) < p_amount then return jsonb_build_object('ok',false,'reason','insufficient'); end if;
  update point_balances set balance = balance - p_amount, updated_at=now() where user_id=v_user;
  insert into point_ledger(user_id, delta, reason) values (v_user, -p_amount, 'duel_cheer');

  insert into duel_cheer_bets(duel_id,user_id,team,amount,boost) values (p_duel,v_user,p_team,p_amount,v_mult);
  if p_team='challenger' then update duels set cheer_chal = cheer_chal + p_amount where id=p_duel;
  else update duels set cheer_opp = cheer_opp + p_amount where id=p_duel; end if;

  select * into d from duels where id=p_duel;
  return jsonb_build_object('ok',true,'chal',d.cheer_chal,'opp',d.cheer_opp,'boosted',(v_mult>1));
end $$;

-- 정산: 이긴 편 배당을 amount*boost 가중으로 분배(진 편 풀은 원금 합, 부스터가 더 큰 몫)
create or replace function public._duel_pay_cheers(p_duel bigint)
returns void language plpgsql security definer set search_path to 'public' as $$
declare d duels%rowtype; v_win text; v_lose_pool int; v_win_weight numeric; r record; v_share int;
begin
  select * into d from duels where id=p_duel for update;
  if d.cheer_paid then return; end if;
  update duels set cheer_paid = true where id = p_duel;

  if d.winner is null then   -- 무승부/무효 → 전액 환불
    for r in select user_id, sum(amount) a from duel_cheer_bets where duel_id=p_duel group by user_id loop
      perform _duel_pay(r.user_id, r.a::int, 'duel_cheer_refund'); end loop;
    return;
  end if;

  v_win := case when d.winner = d.challenger then 'challenger' else 'opponent' end;
  select coalesce(sum(amount),0) into v_lose_pool from duel_cheer_bets where duel_id=p_duel and team <> v_win;
  select coalesce(sum(amount*boost),0) into v_win_weight from duel_cheer_bets where duel_id=p_duel and team = v_win;

  if v_win_weight <= 0 then   -- 이긴 편에 응원 없으면 진 편도 환불
    for r in select user_id, sum(amount) a from duel_cheer_bets where duel_id=p_duel group by user_id loop
      perform _duel_pay(r.user_id, r.a::int, 'duel_cheer_refund'); end loop;
    return;
  end if;

  -- 이긴 편: 원금 + 진 편 풀 × (내 가중지분 / 전체 가중지분)
  for r in select user_id, sum(amount) a, sum(amount*boost) w from duel_cheer_bets
            where duel_id=p_duel and team=v_win group by user_id loop
    v_share := r.a::int + floor(v_lose_pool::numeric * r.w / v_win_weight)::int;
    perform _duel_pay(r.user_id, v_share, 'duel_cheer_win');
    begin
      insert into notifications(user_id, from_user, type, message, link)
      values (r.user_id, null, 'duel_cheer_win', '🔥 응원한 편이 이겼어요! +'||v_share||' GP', 'duel.html?id='||p_duel);
    exception when others then null; end;
  end loop;
end $$;

grant execute on function public.duel_extend_time(bigint)               to authenticated;
grant execute on function public.duel_say(bigint,text,boolean)          to authenticated;
grant execute on function public.duel_rematch(bigint)                   to authenticated;
grant execute on function public.duel_cheer_gp(bigint,text,int,boolean) to authenticated;
revoke all on function public.duel_extend_time(bigint) from anon;
revoke all on function public.duel_rematch(bigint)     from anon;
