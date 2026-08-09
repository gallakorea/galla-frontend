-- 💱 재화 정리: "싸움에 쓰는 건 GP, 꾸미는 건 GC" (2026-08-09)
--
--  왜: 재화가 무료GP·충전GP·GC 셋이고, 규칙이 "충전한 GP인데 예측엔 못 쓴다" 같은
--      예외로 설명돼 유저가 외울 수가 없었다. 규칙이 곧 이름이 되게 정리한다.
--
--    GP = 벌어서 논다.  판매하지 않는다.  → 예측·일기토 판돈, 가챠, 배틀 소모품
--    GC = 돈 내고 산다. 1원 = 1GC.        → 꾸미기, 부스트·밀어주기, AI 실비, 후원
--
--  ⚠️ 가챠는 GP로 남긴다. GC로 바꾸면 '돈 → GP' 경로가 생겨서 예측 판돈을 돈으로 사는
--     셈이 된다(가챠 보상의 절반 이상이 GP다). 사행성 방어선이 뚫리는 지점이라 못 옮긴다.
--     겸사겸사 가챠는 순 -317GP/뽑기라 GP 인플레를 잡는 소각기 역할도 한다.
--
--  ⚠️ 배틀 소모품(방패·격파·부활·쿨다운·침투·답글·일기토권)도 GP로 남긴다.
--     승패에 직접 영향을 주는 걸 돈으로 팔면 pay-to-win이 되고, GP 소각기도 사라진다.

-- ─── GC 지갑 차감 헬퍼 — _gp_spend의 GC판. 원장 기록까지 여기서 한다.
create or replace function public._gc_spend(p_user uuid, p_amt int, p_reason text default 'spend')
returns double precision language plpgsql security definer set search_path to 'public' as $$
declare v_bal int;
begin
  if p_user is null or p_amt is null or p_amt <= 0 then return null; end if;
  insert into gc_balances(user_id) values (p_user) on conflict (user_id) do nothing;
  -- 행 잠금 대신 조건부 update — 잔액이 모자라면 아무 행도 안 바뀌고 v_bal이 null이 된다
  update gc_balances set balance = balance - p_amt, updated_at = now()
    where user_id = p_user and balance >= p_amt
    returning balance into v_bal;
  if v_bal is null then return null; end if;
  insert into gc_ledger(user_id, delta, reason) values (p_user, -p_amt, p_reason);
  return v_bal;
end $$;

-- ─── 품목별 통화. 목록에 있으면 GC(돈), 없으면 GP.
--     ⚠️ 배틀 승패에 영향을 주는 품목은 절대 여기 넣지 마라(pay-to-win + GP 소각기 상실).
insert into public.app_settings (k, v) values ('gc_items', jsonb_build_array(
  'emoticon_pack', 'nick_deco', 'sticker_pack_2', 'sticker_pack_3', 'gif_pack', 'voice_pack'
)) on conflict (k) do update set v = excluded.v;

create or replace function public._item_currency(p_key text)
returns text language sql stable security definer set search_path to 'public' as $$
  select case when coalesce((select v from app_settings where k='gc_items'), '[]'::jsonb) ? p_key
              then 'GC' else 'GP' end;
$$;

CREATE OR REPLACE FUNCTION public.buy_boost(p_type text, p_id bigint, p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_bal := _gc_spend(v_user, v_cost, 'boost:'||p_kind);
  if v_bal is null then return jsonb_build_object('ok',false,'reason','insufficient','currency','GC'); end if;
  insert into content_boosts(user_id, target_type, target_id, kind, until)
    values (v_user, p_type, p_id, p_kind, now() + interval '24 hours');
  return jsonb_build_object('ok',true,'until', (now() + interval '24 hours'));
end $function$;


CREATE OR REPLACE FUNCTION public.buy_ghost_pass(p_days integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid := auth.uid(); v_cost int; v_bal double precision; v_seed text; v_until timestamptz;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_days = 3 then v_cost := 800;
  elsif p_days = 7 then v_cost := 1500;
  elsif p_days = 30 then v_cost := 4500;
  else return jsonb_build_object('ok',false,'reason','bad_days'); end if;

  v_bal := _gc_spend(v_user, v_cost, 'ghost_pass:'||p_days);
  if v_bal is null then
    return jsonb_build_object('ok',false,'reason','insufficient','currency','GC',
      'balance', coalesce((select balance from gc_balances where user_id=v_user),0), 'cost', v_cost); end if;

  v_seed := _ensure_ghost_seed(v_user);
  update user_profiles
    set ghost_until = greatest(coalesce(ghost_until, now()), now()) + make_interval(days=>p_days)
    where user_id=v_user returning ghost_until into v_until;
  return jsonb_build_object('ok',true,'until',v_until,'seed',v_seed,'balance',v_bal);
end $function$;


CREATE OR REPLACE FUNCTION public.buy_nickstyle(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid := auth.uid(); v_name text; v_price int; v_bal double precision;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select name, price into v_name, v_price from _nickstyle_info(p_key);
  if v_name is null then return jsonb_build_object('ok',false,'reason','bad_key'); end if;
  if exists (select 1 from user_nickstyles where user_id=v_user and style_key=p_key) then
    return jsonb_build_object('ok',true,'already',true); end if;
  if v_price > 0 then
    v_bal := _gc_spend(v_user, v_price, 'nickstyle:'||p_key);
    if v_bal is null then return jsonb_build_object('ok',false,'reason','insufficient','currency','GC'); end if;
  end if;
  insert into user_nickstyles(user_id, style_key) values (v_user, p_key) on conflict do nothing;
  return jsonb_build_object('ok',true,'key',p_key);
end $function$;


CREATE OR REPLACE FUNCTION public.push_faction(p_issue_id bigint, p_stance text, p_amount integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_bal numeric; v_pro bigint; v_con bigint;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_stance not in ('pro','con') then return jsonb_build_object('ok',false,'reason','bad_stance'); end if;
  if p_amount is null or p_amount < 100 or p_amount > 1000000 then
    return jsonb_build_object('ok',false,'reason','bad_amount'); end if;
  v_bal := _gc_spend(v_uid, p_amount, 'support:'||p_stance);
  if v_bal is null then
    return jsonb_build_object('ok',false,'reason','insufficient','currency','GC',
      'balance', coalesce((select balance from gc_balances where user_id=v_uid),0), 'cost', p_amount); end if;
  insert into supports(issue_id, user_id, stance, side, amount)
    values (p_issue_id, v_uid, p_stance, p_stance, p_amount);
  select coalesce(sum(amount) filter (where stance='pro'),0),
         coalesce(sum(amount) filter (where stance='con'),0)
    into v_pro, v_con from supports where issue_id=p_issue_id;
  return jsonb_build_object('ok',true,'pro',v_pro,'con',v_con,'balance',v_bal);
end $function$;


CREATE OR REPLACE FUNCTION public.ai_sticker_charge(p_count integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid := auth.uid(); v_cfg jsonb; v_price int; v_today int; v_bal double precision;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  if p_count not in (1, 4) then return jsonb_build_object('ok', false, 'reason', 'bad_count'); end if;
  select v into v_cfg from app_settings where k = 'ai_sticker';
  v_price := case when p_count = 1 then (v_cfg->>'price')::int else (v_cfg->>'set_price')::int end;

  select count(*) into v_today from my_stickers
   where user_id = v_user and created_at > now() - interval '24 hours';
  if v_today + p_count > (v_cfg->>'daily_limit')::int then
    return jsonb_build_object('ok', false, 'reason', 'daily_limit', 'limit', (v_cfg->>'daily_limit')::int);
  end if;

  v_bal := _gc_spend(v_user, v_price, 'ai_sticker:x' || p_count);
  if v_bal is null then
    return jsonb_build_object('ok', false, 'reason', 'insufficient', 'currency', 'GC', 'cost', v_price,
      'balance', coalesce((select balance from gc_balances where user_id = v_user),0));
  end if;
  return jsonb_build_object('ok', true, 'charged', v_price, 'balance', v_bal,
                            'quality', v_cfg->>'quality');
end $function$;


-- ─── buy_item: 품목에 따라 GP 또는 GC로 결제한다.
--     꾸미기(스티커팩·이모티콘·GIF·보이스·닉데코)는 GC, 배틀 소모품은 GP.
create or replace function public.buy_item(p_key text, p_qty integer default 1)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_price int; v_cost int; v_bal double precision; v_qty int; v_cur text;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  if p_qty < 1 or p_qty > 50 then return jsonb_build_object('ok', false, 'reason', 'bad_qty'); end if;
  v_price := _item_price(p_key);
  if v_price is null then return jsonb_build_object('ok', false, 'reason', 'bad_key'); end if;
  v_cost := v_price * p_qty;
  v_cur  := _item_currency(p_key);

  if v_cur = 'GC' then
    v_bal := _gc_spend(v_user, v_cost, 'shop:'||p_key||'x'||p_qty);
    if v_bal is null then
      return jsonb_build_object('ok', false, 'reason', 'insufficient', 'currency', 'GC',
        'balance', coalesce((select balance from gc_balances where user_id=v_user),0), 'cost', v_cost); end if;
  else
    v_bal := _gp_spend(v_user, v_cost);
    if v_bal is null then
      return jsonb_build_object('ok', false, 'reason', 'insufficient', 'currency', 'GP',
        'balance', (select balance from point_balances where user_id=v_user), 'cost', v_cost); end if;
    insert into point_ledger (user_id, delta, reason) values (v_user, -v_cost, 'shop:'||p_key||'x'||p_qty);
  end if;

  insert into user_items (user_id, item_key, qty) values (v_user, p_key, p_qty)
    on conflict (user_id, item_key) do update set qty = user_items.qty + excluded.qty, updated_at = now()
    returning qty into v_qty;
  return jsonb_build_object('ok', true, 'currency', v_cur, 'balance', v_bal, 'qty', v_qty);
end $$;
