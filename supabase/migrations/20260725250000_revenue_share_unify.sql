-- 후원 수익 배분 통일: 플랫폼 20% / 자선 5% / 크리에이터 75%
-- (20260725240000에서 gc_donate·gc_donate_live·request_withdrawal 처리, 여기서 나머지 후원 경로 통일)
-- 요율은 영구 고정. 런칭 후 인상은 신뢰 훼손(트위치 2022·패트리온 2017 선례).


-- ===== gc_donate_plaza =====
CREATE OR REPLACE FUNCTION public.gc_donate_plaza(p_post_id uuid, p_amount integer, p_message text DEFAULT NULL::text, p_anonymous boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_creator uuid; v_bal int;
  v_fee int; v_charity int; v_net int; v_tier text; v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_amount is null or p_amount < 500 or p_amount > 1000000 then
    return jsonb_build_object('ok',false,'reason','bad_amount'); end if;
  select user_id into v_creator from plaza_posts where id = p_post_id;
  if v_creator is null then return jsonb_build_object('ok',false,'reason','no_post'); end if;
  if v_creator = v_uid then return jsonb_build_object('ok',false,'reason','self'); end if;
  select balance into v_bal from gc_balances where user_id=v_uid for update;
  if coalesce(v_bal,0) < p_amount then
    return jsonb_build_object('ok',false,'reason','insufficient','balance',coalesce(v_bal,0)); end if;
  v_fee := floor(p_amount * 0.2)::int;
  v_charity := floor(p_amount * 0.05)::int;
  v_net := p_amount - v_fee - v_charity;
  v_tier := _donation_tier(p_amount);
  update gc_balances set balance = balance - p_amount, updated_at=now() where user_id=v_uid;
  insert into donations(plaza_post_id, creator_id, supporter_id, amount, fee, charity, net,
                        message, is_anonymous, tier, status, method, paid_at)
    values (p_post_id, v_creator, v_uid, p_amount, v_fee, v_charity, v_net,
            nullif(btrim(left(coalesce(p_message,''),200)),''), coalesce(p_anonymous,false),
            v_tier, 'paid', 'gc', now())
    returning id into v_id;
  insert into gc_ledger(user_id, delta, reason, ref_id) values (v_uid, -p_amount, 'gc:donate_plaza', v_id);
  return jsonb_build_object('ok',true,'donation_id',v_id,'amount',p_amount,'fee',v_fee,'charity',v_charity,'net',v_net,'tier',v_tier,'balance',v_bal-p_amount);
end $function$;


-- ===== donate_begin =====
CREATE OR REPLACE FUNCTION public.donate_begin(p_issue_id bigint, p_amount integer, p_message text DEFAULT NULL::text, p_anonymous boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_creator uuid; v_fee int; v_charity int; v_net int; v_id uuid; v_tier text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_amount is null or p_amount < 500 or p_amount > 1000000 then
    return jsonb_build_object('ok',false,'reason','bad_amount'); end if;
  select user_id into v_creator from issues where id = p_issue_id;
  if v_creator is null then return jsonb_build_object('ok',false,'reason','no_issue'); end if;
  if v_creator = v_uid then return jsonb_build_object('ok',false,'reason','self'); end if;
  v_fee := floor(p_amount * 0.2)::int;        -- 플랫폼 20%
  v_charity := floor(p_amount * 0.05)::int;     -- 기부 30%
  v_net := p_amount - v_fee - v_charity;       -- 발의자 50%(+반올림 잔여)
  v_tier := _donation_tier(p_amount);
  insert into donations(issue_id, creator_id, supporter_id, amount, fee, charity, net, message, is_anonymous, tier, status)
    values (p_issue_id, v_creator, v_uid, p_amount, v_fee, v_charity, v_net,
            nullif(btrim(left(coalesce(p_message,''),200)),''), coalesce(p_anonymous,false), v_tier, 'pending')
    returning id into v_id;
  return jsonb_build_object('ok',true,'donation_id',v_id,'amount',p_amount,
    'fee',v_fee,'charity',v_charity,'net',v_net,'tier',v_tier);
end $function$;


-- ===== plaza_donate_begin =====
CREATE OR REPLACE FUNCTION public.plaza_donate_begin(p_post_id uuid, p_amount integer, p_message text DEFAULT NULL::text, p_anonymous boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_creator uuid; v_fee int; v_charity int; v_net int; v_id uuid; v_tier text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_amount is null or p_amount < 500 or p_amount > 1000000 then
    return jsonb_build_object('ok',false,'reason','bad_amount'); end if;
  select user_id into v_creator from plaza_posts where id = p_post_id;
  if v_creator is null then return jsonb_build_object('ok',false,'reason','no_post'); end if;
  if v_creator = v_uid then return jsonb_build_object('ok',false,'reason','self'); end if;
  v_fee := floor(p_amount * 0.2)::int;
  v_charity := floor(p_amount * 0.05)::int;
  v_net := p_amount - v_fee - v_charity;
  v_tier := _donation_tier(p_amount);
  insert into donations(plaza_post_id, creator_id, supporter_id, amount, fee, charity, net, message, is_anonymous, tier, status)
    values (p_post_id, v_creator, v_uid, p_amount, v_fee, v_charity, v_net,
            nullif(btrim(left(coalesce(p_message,''),200)),''), coalesce(p_anonymous,false), v_tier, 'pending')
    returning id into v_id;
  return jsonb_build_object('ok',true,'donation_id',v_id,'amount',p_amount,'fee',v_fee,'charity',v_charity,'net',v_net,'tier',v_tier);
end $function$;
