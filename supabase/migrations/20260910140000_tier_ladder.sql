-- ⬆️ 등급 사다리(2026-09-10) — 올릴수록 확실히 넉넉하게, 그 차이를 숫자로 보여준다.
--   · _tier_month_budget_krw(tier, source): 등급·채널별 한 달 AI 예산(원). 차단(_ai_budget)과 화면 배수가 같은 식을 쓴다.
--   · _ai_budget: 위 함수 사용(판정 동일).
--   · my_entitlement.ladder: 등급별 '한 달 대화량 = 무료의 N배'(web/ios/android). 원 금액은 내보내지 않는다.
--   · 소울메이트 5시간 창 400 → 1000 — 베프(400)와 같아 3배 가격이 손해처럼 보였다.
--     적자 방어는 창이 아니라 월 예산 하드스톱(실수령 × ai_share 0.65)이 한다 — 창을 키워도 손해는 없다.

CREATE OR REPLACE FUNCTION public._tier_month_budget_krw(p_tier text, p_source text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cfg jsonb; v_price numeric;
begin
  select v into v_cfg from app_settings where k = 'ai_margin';
  if p_tier in ('guest', 'free') then
    return coalesce((v_cfg ->> (case when p_tier = 'guest' then 'guest_month_krw' else 'free_month_krw' end))::numeric, 0);
  end if;
  select coalesce((v -> p_tier ->> 'price')::numeric, 0) into v_price from app_settings where k = 'ai_tiers';
  -- ai_tiers.price 는 웹 정가. 인앱은 수수료 얹은 스토어 가격으로 환산한다(웹 4,900 → 인앱 7,000).
  if p_source in ('ios_iap', 'android_iap') then
    v_price := public._charge_price(v_price::int, case p_source when 'ios_iap' then 'ios' else 'android' end);
  end if;
  -- 🚧 모르는 채널은 _net_rate_of 가 '가장 불리한 요율'로 잡는다
  return v_price * public._net_rate_of(p_source) * coalesce((v_cfg ->> 'ai_share')::numeric, 0.40);
end $function$;

revoke execute on function public._tier_month_budget_krw(text, text) from public, anon, authenticated;
grant  execute on function public._tier_month_budget_krw(text, text) to service_role;

CREATE OR REPLACE FUNCTION public._ai_budget(p_uid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cfg jsonb; v_tier text; v_key uuid; v_krw numeric; v_sub subscriptions;
  v_price numeric; v_net numeric; v_budget_usd numeric; v_spent numeric;
  v_since date; v_reset date;
begin
  select v into v_cfg from app_settings where k = 'ai_margin';
  v_tier := case when p_uid is null then 'guest' else public.tier_of(p_uid) end;
  v_key  := coalesce(p_uid, public.ai_guest_uid());
  v_krw  := coalesce((v_cfg ->> 'krw_per_usd')::numeric, 1380);

  if v_tier in ('guest', 'free') then
    v_budget_usd := public._tier_month_budget_krw(v_tier, null) / v_krw;
    v_since := date_trunc('month', (now() at time zone 'Asia/Seoul'))::date;
    v_reset := (v_since + interval '1 month')::date;
  else
    select * into v_sub from subscriptions where user_id = p_uid and expires_at > now();
    -- 💰 등급·채널별 한 달 예산은 _tier_month_budget_krw 한 곳에서 — 화면의 '무료의 N배'와 같은 식이다
    v_budget_usd := public._tier_month_budget_krw(v_tier, v_sub.source) / v_krw;
    v_since := coalesce(v_sub.started_at::date, date_trunc('month', now())::date);
    if v_since < (now() - interval '30 days')::date then
      v_since := ((now() at time zone 'Asia/Seoul')::date
                  - (((now() at time zone 'Asia/Seoul')::date - v_since) % 30));
    end if;
    v_reset := v_since + 30;
  end if;

  select coalesce(sum(cost_usd), 0) into v_spent
    from ai_spend where user_id = v_key and day >= v_since;

  return jsonb_build_object('tier', v_tier, 'budget_usd', v_budget_usd, 'spent_usd', v_spent,
                            'since', v_since, 'resets_on', v_reset);
end $function$
;

CREATE OR REPLACE FUNCTION public.my_entitlement(p_fn text DEFAULT 'galla-friend'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_tier text; v_cfg jsonb; v_win jsonb;
  v_limit int; v_hours numeric; v_used int; v_oldest timestamptz; v_sub subscriptions;
  v_b jsonb; v_pct int; v_ladder jsonb; v_free_b numeric;
begin
  if v_uid is null then return jsonb_build_object('tier', 'guest'); end if;
  v_tier := public.tier_of(v_uid);
  select v into v_cfg from app_settings where k = 'ai_tiers';
  select * into v_sub from subscriptions where user_id = v_uid and expires_at > now();

  v_win   := coalesce(v_cfg -> v_tier -> 'windows' -> p_fn, v_cfg -> v_tier -> 'windows' -> '_default');
  v_limit := coalesce((v_win ->> 'n')::int, -1);
  v_hours := coalesce((v_win ->> 'hours')::numeric, 5);

  select coalesce(sum(calls), 0), min(bucket) filter (where calls > 0) into v_used, v_oldest
    from ai_window_usage
   where subject = 'u:' || v_uid::text and fn = p_fn
     and bucket >= now() - make_interval(secs => (v_hours * 3600)::int);

  -- 💰 이번 주기 대화량 — %만 내보낸다. 원가(USD)는 클라에 줄 이유가 없다.
  v_b := public._ai_budget(v_uid);
  v_pct := case when coalesce((v_b ->> 'budget_usd')::numeric, 0) > 0
                then least(100, floor((v_b ->> 'spent_usd')::numeric / (v_b ->> 'budget_usd')::numeric * 100))::int end;

  -- ⬆️ 등급 사다리 — '한 달 대화량 = 무료의 N배'. 채널마다 실수령이 달라 셋 다 보낸다. 원 금액은 안 보낸다.
  v_free_b := nullif(public._tier_month_budget_krw('free', null), 0);
  select jsonb_object_agg(t.key, jsonb_build_object(
           'web',     round(public._tier_month_budget_krw(t.key, 'web_pg')      / v_free_b, 2),
           'ios',     round(public._tier_month_budget_krw(t.key, 'ios_iap')     / v_free_b, 2),
           'android', round(public._tier_month_budget_krw(t.key, 'android_iap') / v_free_b, 2)))
    into v_ladder
    from jsonb_each(v_cfg) t where t.key <> 'guest';

  return jsonb_build_object(
    'tier', v_tier,
    'label', coalesce(v_cfg -> v_tier ->> 'label', v_tier),
    'features', coalesce(v_cfg -> v_tier -> 'features', '[]'::jsonb),
    'fn', p_fn, 'limit', v_limit, 'used', coalesce(v_used, 0),
    'remaining', case when v_limit < 0 then -1 else greatest(v_limit - coalesce(v_used, 0), 0) end,
    'hours', v_hours,
    'resets_at', case when v_oldest is null then null
                      else v_oldest + make_interval(secs => (v_hours * 3600)::int) end,
    'expires_at', v_sub.expires_at,
    'auto_renew', coalesce(v_sub.auto_renew, false),
    'plans', coalesce(v_cfg, '{}'::jsonb),
    'ladder', coalesce(v_ladder, '{}'::jsonb),
    -- over 는 model_for.downgraded 와 같은 식(spent >= budget) — ai_gate 가 막는 바로 그 조건이다
    'budget', jsonb_build_object(
      'pct', v_pct,
      'over', coalesce((v_b ->> 'spent_usd')::numeric >= (v_b ->> 'budget_usd')::numeric, false),
      'resets_on', v_b ->> 'resets_on')
  );
end $function$
;

update app_settings set v = jsonb_set(v, '{companion_soul,windows,galla-friend,n}', '1000'::jsonb)
 where k = 'ai_tiers' and (v #>> '{companion_soul,windows,galla-friend,n}')::int = 400;
