-- 💰 GP 정합성 2건 수정 (2026-08-08 QA5 감사)
--  ① 파리뮤추얼 정산이 소수점 GP를 만든다(예: 3538.46153846154 지급 → 잔액 100047.6).
--     GP는 정수 게임머니 — 지급액을 floor로 내려 정수화(잔여 소수는 하우스에 남아 총량 초과 지급 방지).
--  ② point_balances.balance DEFAULT 10000(웰컴 지급)이 원장에 안 남아 잔액 ≠ 원장합계(13명 드리프트).
--     → INSERT 트리거로 초기 지급을 원장에 기록 + 기존 드리프트 보정 엔트리 백필.

-- ─────────────────────────────────────────────
-- ② 웰컴 지급 원장 기록
-- ─────────────────────────────────────────────
create or replace function public._log_initial_gp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.balance, 0) <> 0 then
    insert into point_ledger(user_id, delta, reason) values (new.user_id, new.balance, 'welcome_grant');
  end if;
  return new;
end $$;

drop trigger if exists trg_log_initial_gp on public.point_balances;
create trigger trg_log_initial_gp
  after insert on public.point_balances
  for each row execute function public._log_initial_gp();

-- 기존 드리프트 백필 — 잔액과 원장합계 차이를 'reconcile:welcome' 한 줄로 맞춘다(잔액은 건드리지 않음: 유저 손해 0)
insert into point_ledger (user_id, delta, reason)
select b.user_id,
       b.balance - coalesce((select sum(l.delta) from point_ledger l where l.user_id = b.user_id), 0),
       'reconcile:welcome'
from point_balances b
where b.balance <> coalesce((select sum(l.delta) from point_ledger l where l.user_id = b.user_id), 0);

-- ─────────────────────────────────────────────
-- ① 정산 소수점 제거 — 지급·환불·payout 전부 floor
-- ─────────────────────────────────────────────
create or replace function public.predict_resolve(p_market_id bigint, p_outcome_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare v_user uuid := auth.uid(); m record; v_win_pool double precision; v_distrib double precision; v_rake double precision;
  urec record; v_base double precision; v_streak int; v_mult double precision; v_bonus double precision;
  v_paid int := 0; v_refunded boolean := false;
begin
  select * into m from markets where id=p_market_id for update;
  if m is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if m.resolved then return jsonb_build_object('ok',false,'reason','already'); end if;
  if not ((v_user is null) or _is_admin() or (m.created_by = v_user)) then
    return jsonb_build_object('ok',false,'reason','forbidden'); end if;

  if p_outcome_id is not null and not exists(select 1 from market_outcomes where id=p_outcome_id and market_id=p_market_id) then
    return jsonb_build_object('ok',false,'reason','bad_outcome'); end if;

  if p_outcome_id is not null then
    select pool_gp into v_win_pool from market_outcomes where id=p_outcome_id;
  else v_win_pool := 0; end if;
  v_rake := m.total_pool * m.rake_bps / 10000.0;
  v_distrib := m.total_pool - v_rake + coalesce(m.jackpot_bonus,0);

  if coalesce(v_win_pool,0) <= 0 then
    for urec in select user_id, sum(stake) s from predict_bets where market_id=p_market_id and not settled group by user_id loop
      insert into point_balances(user_id) values(urec.user_id) on conflict(user_id) do nothing;
      update point_balances set balance=balance+floor(urec.s), updated_at=now() where user_id=urec.user_id;
      insert into point_ledger(user_id,delta,reason,market_id) values(urec.user_id,floor(urec.s),'predict:refund',p_market_id);
    end loop;
    update predict_bets set settled=true, won=false, payout=floor(stake) where market_id=p_market_id and not settled;
    v_refunded := true;
  else
    for urec in select user_id, sum(stake) filter (where outcome_id=p_outcome_id) as win_stake
                from predict_bets where market_id=p_market_id and not settled group by user_id loop
      if coalesce(urec.win_stake,0) > 0 then
        -- 💰 정수화: 원금비례 지급액과 콤보 보너스를 각각 내림(총 지급 ≤ 분배풀 보장)
        v_base := floor(urec.win_stake / v_win_pool * v_distrib);
        insert into predict_streaks(user_id,current,best) values(urec.user_id,1,1)
          on conflict(user_id) do update set current=predict_streaks.current+1,
            best=greatest(predict_streaks.best, predict_streaks.current+1), updated_at=now()
          returning current into v_streak;
        v_mult := _combo_mult(v_streak);
        v_bonus := floor(v_base*(v_mult-1));
        insert into point_balances(user_id) values(urec.user_id) on conflict(user_id) do nothing;
        update point_balances set balance=balance+v_base+v_bonus, updated_at=now() where user_id=urec.user_id;
        insert into point_ledger(user_id,delta,reason,market_id) values(urec.user_id, v_base, 'predict:win', p_market_id);
        if v_bonus>0 then insert into point_ledger(user_id,delta,reason,market_id) values(urec.user_id, v_bonus, 'predict:combo', p_market_id); end if;
        v_paid := v_paid + 1;
      else
        update predict_streaks set current=0, updated_at=now() where user_id=urec.user_id;
      end if;
    end loop;
    update predict_bets set settled=true, won=(outcome_id=p_outcome_id),
      payout = case when outcome_id=p_outcome_id then floor(stake / v_win_pool * v_distrib) else 0 end
      where market_id=p_market_id and not settled;
  end if;

  update market_outcomes set is_winner=(p_outcome_id is not null and id=p_outcome_id) where market_id=p_market_id;
  update markets set resolved=true, resolved_at=now(), status='resolved', resolved_outcome_id=p_outcome_id where id=p_market_id;
  return jsonb_build_object('ok',true,'paid_users',v_paid,'distributed',v_distrib,'refunded',v_refunded,'jackpot',m.jackpot_bonus);
end $function$;

-- 기존 소수점 잔액 정리(내림) + 차액을 원장에 남겨 정합 유지
insert into point_ledger (user_id, delta, reason)
select user_id, floor(balance) - balance, 'reconcile:round'
from point_balances where balance <> floor(balance);
update point_balances set balance = floor(balance) where balance <> floor(balance);
