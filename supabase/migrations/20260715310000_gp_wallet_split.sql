-- 💠 GP 지갑 이원화 — 유료 충전 GP는 게임(예측·일기토) 투입 차단 (currency-policy ② 완전판)
--  · point_balances.balance      = 무료 GP (게임 + 소각형 모두 사용 가능)
--  · point_balances.paid_balance = 유료 충전 GP (소각형 소비 전용: 아이템·꾸미기·가챠·부스트·밀어주기)
--  · 게임 RPC(place_bet, _duel_lock_stake)는 balance만 보므로 자동 차단됨.
--  · 소각형 RPC는 _gp_spend()로 유료 우선 차감(유료를 먼저 태워 무료=게임 가능분 보존).
--  기존 충전 이력 0건 확인 → 잔액 이관 불필요.

alter table public.point_balances
  add column if not exists paid_balance double precision not null default 0;

/* 소각형 공용 차감: 유료 우선 → 무료. 반환 = 차감 후 총잔액(부족 시 null) */
create or replace function public._gp_spend(p_user uuid, p_amt double precision)
returns double precision language plpgsql security definer set search_path = public as $$
declare v_free double precision; v_paid double precision; v_from_paid double precision;
begin
  if p_amt is null or p_amt <= 0 then return null; end if;
  insert into point_balances(user_id) values(p_user) on conflict (user_id) do nothing;
  select balance, paid_balance into v_free, v_paid from point_balances where user_id=p_user for update;
  if coalesce(v_free,0) + coalesce(v_paid,0) < p_amt then return null; end if;
  v_from_paid := least(coalesce(v_paid,0), p_amt);
  update point_balances
     set paid_balance = paid_balance - v_from_paid,
         balance = balance - (p_amt - v_from_paid),
         updated_at = now()
   where user_id = p_user;
  return (coalesce(v_free,0) + coalesce(v_paid,0)) - p_amt;
end $$;
revoke all on function public._gp_spend(uuid,double precision) from public, anon, authenticated;

/* 지갑 조회: 표시용 총액 + 게임 가능분 구분 */
create or replace function public.gp_wallet()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_free double precision; v_paid double precision;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  insert into point_balances(user_id) values(auth.uid()) on conflict (user_id) do nothing;
  select balance, paid_balance into v_free, v_paid from point_balances where user_id=auth.uid();
  return jsonb_build_object('ok',true,'free',coalesce(v_free,0),'paid',coalesce(v_paid,0),
    'total', coalesce(v_free,0)+coalesce(v_paid,0));
end $$;
grant execute on function public.gp_wallet() to authenticated;

/* ensure_balance = 표시용 총액 (기존 호출부 전부 표시 용도) */
create or replace function public.ensure_balance()
returns double precision language plpgsql security definer set search_path = public as $$
declare v_bal double precision; v_user uuid := auth.uid();
begin
  if v_user is null then return null; end if;
  insert into point_balances (user_id) values (v_user) on conflict (user_id) do nothing;
  select balance + paid_balance into v_bal from point_balances where user_id = v_user;
  return v_bal;
end $$;

/* 충전 확정 → 유료 지갑으로 (기존: balance) */
create or replace function public.charge_confirm(p_charge_id uuid, p_pg_provider text default null, p_pg_tx text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c gp_charges%rowtype; v_total int; v_bal numeric;
begin
  if not ((select auth.role())='service_role' or _is_admin()) then
    return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  select * into c from gp_charges where id=p_charge_id;
  if c.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if c.status='paid' then return jsonb_build_object('ok',true,'already',true); end if;
  v_total := c.gp + c.bonus;
  insert into point_balances(user_id) values(c.user_id) on conflict (user_id) do nothing;
  update point_balances set paid_balance = paid_balance + v_total, updated_at = now()
    where user_id=c.user_id returning balance + paid_balance into v_bal;
  insert into point_ledger(user_id, delta, reason) values (c.user_id, v_total, 'charge:'||coalesce(c.pkg,'gp'));
  update gp_charges set status='paid', paid_at=now(), pg_provider=p_pg_provider, pg_tx_id=p_pg_tx where id=p_charge_id;
  return jsonb_build_object('ok',true,'credited',v_total,'balance',v_bal);
end $$;

/* ---------- 소각형 5종: _gp_spend(유료 우선) 적용, 반환 잔액은 총액 ---------- */

create or replace function public.buy_item(p_key text, p_qty integer default 1)
returns jsonb language plpgsql security definer set search_path to public as $$
declare v_user uuid := auth.uid(); v_price int; v_cost int; v_bal double precision; v_qty int;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  if p_qty < 1 or p_qty > 50 then return jsonb_build_object('ok', false, 'reason', 'bad_qty'); end if;
  v_price := _item_price(p_key);
  if v_price is null then return jsonb_build_object('ok', false, 'reason', 'bad_key'); end if;
  v_cost := v_price * p_qty;
  v_bal := _gp_spend(v_user, v_cost);
  if v_bal is null then
    return jsonb_build_object('ok', false, 'reason', 'insufficient',
      'balance', (select balance+paid_balance from point_balances where user_id=v_user), 'cost', v_cost);
  end if;
  insert into point_ledger (user_id, delta, reason) values (v_user, -v_cost, 'shop:'||p_key||'x'||p_qty);
  insert into user_items (user_id, item_key, qty) values (v_user, p_key, p_qty)
    on conflict (user_id, item_key) do update set qty = user_items.qty + excluded.qty, updated_at = now()
    returning qty into v_qty;
  return jsonb_build_object('ok', true, 'balance', v_bal, 'qty', v_qty);
end $$;

create or replace function public.buy_nickstyle(p_key text)
returns jsonb language plpgsql security definer set search_path to public as $$
declare v_user uuid := auth.uid(); v_name text; v_price int; v_bal double precision;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select name, price into v_name, v_price from _nickstyle_info(p_key);
  if v_name is null then return jsonb_build_object('ok',false,'reason','bad_key'); end if;
  if exists (select 1 from user_nickstyles where user_id=v_user and style_key=p_key) then
    return jsonb_build_object('ok',true,'already',true); end if;
  if v_price > 0 then
    v_bal := _gp_spend(v_user, v_price);
    if v_bal is null then return jsonb_build_object('ok',false,'reason','insufficient'); end if;
    insert into point_ledger(user_id, delta, reason) values (v_user, -v_price, 'nickstyle:'||p_key);
  end if;
  insert into user_nickstyles(user_id, style_key) values (v_user, p_key) on conflict do nothing;
  return jsonb_build_object('ok',true,'key',p_key);
end $$;

create or replace function public.buy_boost(p_type text, p_id bigint, p_kind text)
returns jsonb language plpgsql security definer set search_path to public as $$
declare v_user uuid := auth.uid(); v_cost int; v_owner uuid; v_bal double precision;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_kind = 'pin' and p_type = 'issue' then
    v_cost := 2000; select user_id into v_owner from issues where id = p_id;
  elsif p_kind = 'highlight' and p_type = 'comment' then
    v_cost := 800; select user_id into v_owner from comments where id = p_id;
  else return jsonb_build_object('ok',false,'reason','bad_kind'); end if;
  if v_owner is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if v_owner <> v_user then return jsonb_build_object('ok',false,'reason','not_owner'); end if;
  v_bal := _gp_spend(v_user, v_cost);
  if v_bal is null then return jsonb_build_object('ok',false,'reason','insufficient'); end if;
  insert into point_ledger(user_id, delta, reason) values (v_user, -v_cost, 'boost:'||p_kind);
  insert into content_boosts(user_id, target_type, target_id, kind, until)
    values (v_user, p_type, p_id, p_kind, now() + interval '24 hours');
  return jsonb_build_object('ok',true,'until', (now() + interval '24 hours'));
end $$;

create or replace function public.gacha_draw()
returns jsonb language plpgsql security definer set search_path to public as $$
declare
  v_user uuid := auth.uid();
  c_cost constant int := 700; c_daily constant int := 30;
  v_today int; v_bal double precision; v_roll double precision := random();
  v_type text; v_key text; v_gp int := 0; v_label text; v_grade text := 'common'; v_pick text;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select count(*) into v_today from gacha_pulls where user_id=v_user and created_at::date = current_date;
  if v_today >= c_daily then return jsonb_build_object('ok',false,'reason','daily_limit','limit',c_daily,'used',v_today); end if;
  v_bal := _gp_spend(v_user, c_cost);
  if v_bal is null then return jsonb_build_object('ok',false,'reason','insufficient'); end if;
  insert into point_ledger(user_id, delta, reason) values (v_user, -c_cost, 'gacha');

  if v_roll < 0.30 then v_type:='bust'; v_gp:=0; v_grade:='bust'; v_label:='🗑️ 꽝… 다음 기회에!';
  elsif v_roll < 0.50 then v_type:='gp'; v_gp:=100; v_label:='+100 GP';
  elsif v_roll < 0.66 then v_type:='gp'; v_gp:=300; v_label:='+300 GP';
  elsif v_roll < 0.79 then
    select k into v_pick from (select unnest(array['sticker_pack_2','sticker_pack_3']) k) t
      where not exists (select 1 from user_items where user_id=v_user and item_key=t.k and qty>0) order by random() limit 1;
    if v_pick is not null then
      insert into user_items(user_id,item_key,qty) values(v_user,v_pick,1)
        on conflict (user_id,item_key) do update set qty=user_items.qty+1;
      v_type:='sticker'; v_key:=v_pick; v_grade:='rare';
      v_label:= case v_pick when 'sticker_pack_2' then '🔥 감정폭발 스티커팩!' else '💢 정시밈 스티커팩!' end;
    else v_type:='gp'; v_gp:=400; v_label:='+400 GP'; end if;
  elsif v_roll < 0.88 then v_type:='gp'; v_gp:=1000; v_label:='+1,000 GP'; v_grade:='rare';
  elsif v_roll < 0.95 then v_type:='gp'; v_gp:=800; v_label:='+800 GP'; v_grade:='rare';
  elsif v_roll < 0.975 then
    select k into v_pick from (select unnest(array['ice','neon','toxic','fire','royal']) k) t
      where not exists (select 1 from user_nickstyles where user_id=v_user and style_key=t.k) order by random() limit 1;
    if v_pick is not null then
      insert into user_nickstyles(user_id,style_key) values(v_user,v_pick) on conflict do nothing;
      v_type:='nickstyle'; v_key:=v_pick; v_grade:='epic'; v_label:='🎨 닉 스타일 획득: '||(select name from _nickstyle_info(v_pick));
    else v_type:='gp'; v_gp:=1500; v_label:='+1,500 GP'; end if;
  elsif v_roll < 0.99 then v_type:='gp'; v_gp:=2000; v_label:='🔥 대박! +2,000 GP'; v_grade:='epic';
  else v_type:='gp'; v_gp:=5000; v_label:='💎 잭팟! +5,000 GP'; v_grade:='legendary';
  end if;

  -- 당첨 GP는 무료 지갑으로 (획득 재화 — 게임 사용 가능)
  if v_gp > 0 then
    update point_balances set balance = balance + v_gp, updated_at=now() where user_id=v_user;
    insert into point_ledger(user_id, delta, reason) values (v_user, v_gp, 'gacha_win');
  end if;
  insert into gacha_pulls(user_id, reward_type, reward_key, reward_gp) values (v_user, v_type, v_key, v_gp);
  select balance + paid_balance into v_bal from point_balances where user_id=v_user;
  return jsonb_build_object('ok',true,'type',v_type,'key',v_key,'gp',v_gp,'label',v_label,'grade',v_grade,
    'balance',round(v_bal),'used',v_today+1,'limit',c_daily);
end $$;

create or replace function public.push_faction(p_issue_id bigint, p_stance text, p_amount integer)
returns jsonb language plpgsql security definer set search_path to public as $$
declare v_uid uuid := auth.uid(); v_bal numeric; v_pro bigint; v_con bigint;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_stance not in ('pro','con') then return jsonb_build_object('ok',false,'reason','bad_stance'); end if;
  if p_amount is null or p_amount < 100 or p_amount > 1000000 then
    return jsonb_build_object('ok',false,'reason','bad_amount'); end if;
  v_bal := _gp_spend(v_uid, p_amount);
  if v_bal is null then
    return jsonb_build_object('ok',false,'reason','insufficient',
      'balance', coalesce((select balance+paid_balance from point_balances where user_id=v_uid),0), 'cost', p_amount); end if;
  insert into point_ledger(user_id, delta, reason) values (v_uid, -p_amount, 'support:'||p_stance);
  insert into supports(issue_id, user_id, stance, side, amount)
    values (p_issue_id, v_uid, p_stance, p_stance, p_amount);
  select coalesce(sum(amount) filter (where stance='pro'),0),
         coalesce(sum(amount) filter (where stance='con'),0)
    into v_pro, v_con from supports where issue_id=p_issue_id;
  return jsonb_build_object('ok',true,'pro',v_pro,'con',v_con,'balance',v_bal);
end $$;

/* place_bet: 부족 응답에 무료/유료 구분 제공 (프론트 안내용) — 차감은 기존대로 무료(balance)만 */
create or replace function public.place_bet(p_market_id bigint, p_outcome_id bigint, p_stake double precision)
returns jsonb language plpgsql security definer set search_path to public as $$
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
end $$;
