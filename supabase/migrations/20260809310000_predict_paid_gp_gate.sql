-- 🛡 해외 예측 규제 가드 — 충전 GP로는 베팅 금지 (2026-08-09)
--
--  결정: 영어권 등 해외에서 예측 마켓은 **무료 GP 전용**으로 운영한다.
--  이유: 실제 돈으로 산 재화를 결과에 걸고 따는 구조는 미국 CFTC를 비롯해
--        여러 나라에서 도박·파생상품 규제 대상이다. 게임 재화로 남겨두면 여지가 크게 준다.
--
--  구현: place_bet에 한 겹만 덧댄다. 기존 로직은 손대지 않는다.
--        balance = 무료 GP + 충전 GP, paid_balance = 그중 충전분.
--        허용 언어(기본 ko) 밖의 유저는 무료분(balance - paid_balance)까지만 걸 수 있다.
--
--  ⚠️ app_settings.predict_regulation.paid_gp_ok 에 언어를 추가하면 그 나라가 풀린다.
--     푸는 건 법률 검토가 끝난 뒤에만 해라. 코드 수정 없이 열리게 해둔 건 편의지 허가가 아니다.

insert into public.app_settings (k, v)
values ('predict_regulation', jsonb_build_object('paid_gp_ok', jsonb_build_array('ko')))
on conflict (k) do nothing;

CREATE OR REPLACE FUNCTION public.place_bet(p_market_id bigint, p_outcome_id bigint, p_stake double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid := auth.uid(); m record; o record; v_bal double precision; v_paid double precision; v_other int; v_had int; v_odds double precision;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_stake is null or p_stake<=0 then return jsonb_build_object('ok',false,'reason','bad_amount'); end if;
  select * into o from market_outcomes where id=p_outcome_id for update;
  if o is null or o.market_id<>p_market_id then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  select * into m from markets where id=p_market_id for update;
  if m.resolved or m.status<>'open' or m.close_at<=now() then return jsonb_build_object('ok',false,'reason','closed'); end if;
  if p_stake < m.min_stake then return jsonb_build_object('ok',false,'reason','below_min','min',m.min_stake); end if;
  if p_stake > m.max_stake then return jsonb_build_object('ok',false,'reason','above_max','max',m.max_stake); end if;
  select count(*) into v_other from predict_bets where market_id=p_market_id and user_id=v_user and outcome_id<>p_outcome_id;
  if v_other>0 then return jsonb_build_object('ok',false,'reason','other_side'); end if;

  insert into point_balances(user_id) values(v_user) on conflict(user_id) do nothing;
  select balance, paid_balance into v_bal, v_paid from point_balances where user_id=v_user for update;
  if v_bal < p_stake then
    return jsonb_build_object('ok',false,'reason','insufficient','balance',v_bal,'paid',coalesce(v_paid,0)); end if;

  -- 🛡 해외 예측 규제 가드 (CFTC 등) — 충전(실제 돈)으로 산 GP는 베팅에 못 쓴다.
  --    balance는 무료 GP + 충전 GP의 합이고 paid_balance가 그중 '충전분'이다.
  --    이 언어권에서는 무료분(balance - paid_balance)만 판돈으로 인정한다.
  --    ⚠️ 여기를 풀면 '실제 돈으로 사서 결과에 걸고 딴다'가 되어 도박 규제 대상이 된다.
  --       나라를 열 때 반드시 법률 검토부터 하고 app_settings로 켜라.
  -- ⚠️ coalesce(..., false)가 핵심이다. 유저 행이 없어 NULL이 나오면 `if not NULL`은 거짓이라
  --    가드가 통째로 건너뛰어진다 — 안전한 쪽(가드 적용)으로 떨어뜨린다.
  if not coalesce((
        select coalesce(u.locale, 'ko') = any (
                 select jsonb_array_elements_text(coalesce(
                   (select v -> 'paid_gp_ok' from app_settings where k = 'predict_regulation'),
                   '["ko"]'::jsonb)))
          from users u where u.id = v_user), false) then
    if (coalesce(v_bal,0) - coalesce(v_paid,0)) < p_stake then
      return jsonb_build_object('ok', false, 'reason', 'paid_gp_not_allowed',
                                'free', coalesce(v_bal,0) - coalesce(v_paid,0));
    end if;
  end if;

  select count(*) into v_had from predict_bets where outcome_id=p_outcome_id and user_id=v_user;

  update point_balances set balance=balance-p_stake, updated_at=now() where user_id=v_user;
  insert into point_ledger(user_id,delta,reason,market_id) values(v_user,-p_stake,'predict:bet',p_market_id);
  update market_outcomes set pool_gp=pool_gp+p_stake,
         bettor_count=bettor_count + (case when v_had=0 then 1 else 0 end) where id=p_outcome_id;
  update markets set total_pool=total_pool+p_stake, volume=coalesce(volume,0)+p_stake where id=p_market_id;

  v_odds := (m.total_pool + p_stake + coalesce(m.jackpot_bonus,0)) / (o.pool_gp + p_stake);
  insert into predict_bets(market_id,outcome_id,user_id,stake,odds_at_bet)
    values(p_market_id,p_outcome_id,v_user,p_stake,v_odds);
  return jsonb_build_object('ok',true,'balance',v_bal-p_stake,'odds',round(v_odds::numeric,2));
end $function$

