-- ↩️ 되돌림: 잘못 넣은 예측 규제 가드 제거 (2026-08-09)
--
--  내가 balance를 '무료+충전 합계', paid_balance를 '그중 충전분 마커'로 잘못 읽고
--  20260809310000에서 place_bet에 가드를 덧댔다. 전제가 틀렸다.
--
--  실제 구조: balance = 무료 GP 지갑 / paid_balance = 충전 GP 지갑. **별개의 두 지갑**이다.
--   · charge_confirm은 paid_balance에만 넣는다
--   · gp_wallet은 free / paid / total(합)로 나눠서 준다
--   · _gp_spend(아이템 등)는 유료분부터 쓰고 모자라면 무료분을 쓴다
--   · place_bet은 balance(무료)만 검사하고 balance에서만 차감한다
--     → **충전 GP로는 애초에 예측을 할 수 없었다.** 가드가 필요 없다.
--
--  ⚠️ 게다가 내 식 `무료분 = balance - paid_balance`는 해롭다.
--     무료 10만·충전 10만인 정상 유저의 무료분을 0으로 계산해 베팅을 막는다.
--     실측: ①충전만 → insufficient(원래부터 차단) ②무료+충전 → ok ③무료만 → ok
--
--  교훈: 잔액 컬럼이 두 개면 '합계+마커'인지 '별개 지갑'인지부터 확인한다.
--        여기선 _gp_spend의 `if v_free + v_paid < p_amt` 한 줄이 답을 갖고 있었다.

delete from public.app_settings where k = 'predict_regulation';

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
