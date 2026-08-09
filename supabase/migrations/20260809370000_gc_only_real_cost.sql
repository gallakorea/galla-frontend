-- 💱 재화 재정의: "실제 돈이 나가는 것만 GC, 나머지는 전부 GP" (2026-08-09, 사장님 확정)
--
--  앞선 안(꾸미기·부스트·밀어주기까지 GC)을 되돌린다. 기준을 하나로 통일한다:
--
--    GC = 우리 지갑에서 실제로 돈이 나가는 것 → AI 창작·AI 스티커·갈비스 고급, 그리고 후원
--    GP = 그 외 전부 → 아이템(꾸미기·유령권·무전기 포함), 부스트, 진영 밀어주기,
--                      배틀·도전, 가챠, 예측·일기토 판돈
--
--  왜 이게 더 낫나: GC의 정의가 '원가'로 딱 떨어진다. 마진 관리가 단순해지고
--  ("GC 매출 ≥ AI 원가"만 보면 된다), 유저는 "돈 드는 건 GC" 한 줄만 외우면 된다.
--
--  ⚠️ GP는 여전히 판매하지 않는다. 예측 판돈으로 쓰이기 때문이다.
--     GP를 팔면 '돈으로 산 재화로 결과에 걸고 딴다'가 되어 규제 대상이 된다.
--  ⚠️ 부작용(의도된 것): 꾸미기·부스트·밀어주기에서 직접 매출이 사라진다.
--     매출 경로는 AI(GC)와 후원 둘이다. 대신 GP 소각처가 늘어 인플레는 잡힌다.

-- 상점 품목은 전부 GP. 분기 구조(_item_currency)는 남겨둔다 — 나중에 조정할 여지.
update public.app_settings set v = '[]'::jsonb where k = 'gc_items';

-- 클라이언트가 서버와 같은 판정을 쓰도록 목록을 노출한다.
-- ⚠️ 클라이언트에 목록을 복사해두면 반드시 어긋난다(이번에 실제로 어긋났다).
create or replace function public.gc_item_keys()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce((select v from app_settings where k = 'gc_items'), '[]'::jsonb);
$$;
grant execute on function public.gc_item_keys() to anon, authenticated;

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
  v_bal := _gp_spend(v_user, v_cost);
  if v_bal is null then return jsonb_build_object('ok',false,'reason','insufficient'); end if;
  insert into point_ledger(user_id, delta, reason) values (v_user, -v_cost, 'boost:'||p_kind);
  insert into content_boosts(user_id, target_type, target_id, kind, until)
    values (v_user, p_type, p_id, p_kind, now() + interval '24 hours');
  return jsonb_build_object('ok',true,'until', (now() + interval '24 hours'));
end $function$
;

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

  v_bal := _gp_spend(v_user, v_cost);
  if v_bal is null then
    return jsonb_build_object('ok',false,'reason','insufficient',
      'balance', coalesce((select balance+paid_balance from point_balances where user_id=v_user),0), 'cost', v_cost); end if;
  insert into point_ledger(user_id, delta, reason) values (v_user, -v_cost, 'ghost_pass:'||p_days);

  v_seed := _ensure_ghost_seed(v_user);
  update user_profiles
    set ghost_until = greatest(coalesce(ghost_until, now()), now()) + make_interval(days=>p_days)
    where user_id=v_user returning ghost_until into v_until;
  return jsonb_build_object('ok',true,'until',v_until,'seed',v_seed,'balance',v_bal);
end $function$
;

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
    v_bal := _gp_spend(v_user, v_price);
    if v_bal is null then return jsonb_build_object('ok',false,'reason','insufficient'); end if;
    insert into point_ledger(user_id, delta, reason) values (v_user, -v_price, 'nickstyle:'||p_key);
  end if;
  insert into user_nickstyles(user_id, style_key) values (v_user, p_key) on conflict do nothing;
  return jsonb_build_object('ok',true,'key',p_key);
end $function$
;

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
end $function$
;

