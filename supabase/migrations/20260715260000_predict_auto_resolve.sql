-- 자동 정산: predict_resolve에 무승부/판정불가 환불 경로(p_outcome_id null) 추가
create or replace function predict_resolve(p_market_id bigint, p_outcome_id bigint)
returns jsonb language plpgsql security definer set search_path to public as $$
declare v_user uuid := auth.uid(); m record; v_win_pool double precision; v_distrib double precision; v_rake double precision;
  urec record; v_base double precision; v_streak int; v_mult double precision; v_bonus double precision;
  v_paid int := 0; v_refunded boolean := false;
begin
  select * into m from markets where id=p_market_id for update;
  if m is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if m.resolved then return jsonb_build_object('ok',false,'reason','already'); end if;
  if not ((v_user is null) or _is_admin() or (m.created_by = v_user)) then
    return jsonb_build_object('ok',false,'reason','forbidden'); end if;

  -- p_outcome_id null = 무승부/판정불가 → 전액 환불 종료
  if p_outcome_id is not null and not exists(select 1 from market_outcomes where id=p_outcome_id and market_id=p_market_id) then
    return jsonb_build_object('ok',false,'reason','bad_outcome'); end if;

  if p_outcome_id is not null then
    select pool_gp into v_win_pool from market_outcomes where id=p_outcome_id;
  else v_win_pool := 0; end if;
  v_rake := m.total_pool * m.rake_bps / 10000.0;
  v_distrib := m.total_pool - v_rake + coalesce(m.jackpot_bonus,0);

  if coalesce(v_win_pool,0) <= 0 then
    -- 승자 없음(아무도 안 걸었거나 환불 정산) → 전액 환불, 연승 영향 없음
    for urec in select user_id, sum(stake) s from predict_bets where market_id=p_market_id and not settled group by user_id loop
      insert into point_balances(user_id) values(urec.user_id) on conflict(user_id) do nothing;
      update point_balances set balance=balance+urec.s, updated_at=now() where user_id=urec.user_id;
      insert into point_ledger(user_id,delta,reason,market_id) values(urec.user_id,urec.s,'predict:refund',p_market_id);
    end loop;
    update predict_bets set settled=true, won=false, payout=stake where market_id=p_market_id and not settled;
    v_refunded := true;
  else
    for urec in select user_id, sum(stake) filter (where outcome_id=p_outcome_id) as win_stake
                from predict_bets where market_id=p_market_id and not settled group by user_id loop
      if coalesce(urec.win_stake,0) > 0 then
        v_base := urec.win_stake / v_win_pool * v_distrib;
        insert into predict_streaks(user_id,current,best) values(urec.user_id,1,1)
          on conflict(user_id) do update set current=predict_streaks.current+1,
            best=greatest(predict_streaks.best, predict_streaks.current+1), updated_at=now()
          returning current into v_streak;
        v_mult := _combo_mult(v_streak);
        v_bonus := v_base*(v_mult-1);
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
      payout = case when outcome_id=p_outcome_id then stake / v_win_pool * v_distrib else 0 end
      where market_id=p_market_id and not settled;
  end if;

  update market_outcomes set is_winner=(p_outcome_id is not null and id=p_outcome_id) where market_id=p_market_id;
  update markets set resolved=true, resolved_at=now(), status='resolved', resolved_outcome_id=p_outcome_id where id=p_market_id;
  return jsonb_build_object('ok',true,'paid_users',v_paid,'distributed',v_distrib,'refunded',v_refunded,'jackpot',m.jackpot_bonus);
end $$;

-- 자동 정산 크론: 매시 40분 (엣지 predict-auto-resolve — 이슈연계=투표 판정, 일반=AI 심판+뉴스 근거)
select cron.unschedule('predict_auto_resolve_job') where exists (
  select 1 from cron.job where jobname = 'predict_auto_resolve_job'
);
-- (아래 anon 키는 공개 키 — js/supabase.js에 이미 노출된 값)
select cron.schedule(
  'predict_auto_resolve_job',
  '40 * * * *',
  $$select net.http_post(
      url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/predict-auto-resolve',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM'),
      body := '{}'::jsonb
    );$$
);
