-- 🛟 GP가 떨어져도 계속 놀 수 있게 — 파산 방지 + 재기 지원금 (2026-08-09)
--
--  전제 확인: 글쓰기·댓글·투표·배틀 참전·팔로우·DM·갈비스에는 GP가 한 푼도 안 든다.
--  (GP 차감 함수를 전수조사해 확인했다) 그래서 GP가 0이어도 '활동'은 전부 된다.
--  못 하는 건 예측 베팅·일기토 판돈·아이템 구매뿐이다.
--
--  그럼에도 두 구멍이 있었다:
--   ① 예측 최대 판돈이 1,000,000 — 사실상 무제한이라 한 방에 며칠치가 날아간다
--   ② 잔액이 0이 되면 다음 출석까지 그냥 기다려야 한다 (바닥 방지 장치 없음)
--
--  하루 무료 수급 실측(상한까지 다 채웠을 때):
--    이슈 120×2 + 마켓생성 100×2 + 댓글 20×15 + 투표 10×30 + 팔로우 15×10
--    + 일기토관전 15×20 + 배틀격파 400 + 출석·상자 ≈ 2,350 GP/일

CREATE OR REPLACE FUNCTION public.place_bet(p_market_id bigint, p_outcome_id bigint, p_stake double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid := auth.uid(); m record; o record; v_bal double precision; v_paid double precision; v_other int; v_had int; v_odds double precision; v_cap double precision;
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

  -- 🛡 파산 방지 — 한 번에 전 재산을 태우지 못하게 한다.
  --    하루 무료 수급이 최대 2,350인데 상한이 1,000,000이면 한 방에 며칠치가 날아가고,
  --    그날부터 예측을 못 한다. 그게 이탈이다. 보유 GP의 30%까지만 걸 수 있게 막는다.
  --    (최소 판돈 10은 항상 허용 — 잔액이 적어도 참여 자체는 막지 않는다)
  v_cap := greatest(10::double precision, floor(coalesce(v_bal,0) * 0.30));
  if p_stake > v_cap then
    return jsonb_build_object('ok',false,'reason','stake_cap','cap',v_cap,'balance',v_bal); end if;

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
end $function$;

-- ─── 재기 지원금: 잔액이 바닥나면 하루 한 번 채워준다.
--     예측 최소 판돈이 10이니 1,000이면 충분히 논다. "0이 돼도 내일이면 논다"를 보장한다.
--     ⚠️ 임계 미만일 때만 + 하루 1회. 안 그러면 무한 수급이 된다.
--     ⚠️ 무료 지갑(balance)에만 넣는다. 이건 벌어서 얻는 재화의 성격을 유지해야 한다.
create or replace function public.gp_relief()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_bal double precision; v_floor int; v_to int; v_add double precision;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  v_floor := coalesce((select (v->>'threshold')::int from app_settings where k='gp_relief'), 300);
  v_to    := coalesce((select (v->>'top_up_to')::int from app_settings where k='gp_relief'), 1000);

  insert into point_balances(user_id) values (v_user) on conflict (user_id) do nothing;
  select balance into v_bal from point_balances where user_id = v_user for update;
  if coalesce(v_bal,0) >= v_floor then
    return jsonb_build_object('ok',true,'granted',0,'balance',v_bal); end if;
  if exists (select 1 from point_ledger
             where user_id=v_user and reason='relief' and created_at::date = current_date) then
    return jsonb_build_object('ok',true,'granted',0,'reason','already_today','balance',v_bal); end if;

  v_add := v_to - coalesce(v_bal,0);
  update point_balances set balance = balance + v_add, updated_at = now() where user_id = v_user;
  insert into point_ledger(user_id, delta, reason) values (v_user, v_add, 'relief');
  return jsonb_build_object('ok',true,'granted',v_add,'balance',v_to);
end $$;

grant execute on function public.gp_relief() to authenticated;

insert into public.app_settings (k, v)
values ('gp_relief', jsonb_build_object('threshold', 300, 'top_up_to', 1000))
on conflict (k) do nothing;

-- ─── GP 충전 중단 — GP는 이제 판매하지 않는다(예측 판돈이라 사행성 방어선).
--     기존 charge_confirm은 paid_balance에 GP를 적립하던 함수다. 무력화한다.
--     ⚠️ 되살리지 마라. GP를 팔면 '돈으로 산 재화로 결과에 건다'가 되어 규제 대상이 된다.
create or replace function public.charge_confirm(p_charge_id bigint, p_pg_provider text default null, p_pg_tx text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  return jsonb_build_object('ok', false, 'reason', 'gp_charge_discontinued',
    'message', 'GP는 판매하지 않습니다. 충전은 GC로만 가능합니다.');
end $$;
