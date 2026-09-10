-- ⬆️ 상위 등급 안내(2026-09-10) — 예산 상태를 화면이 볼 수 있게 한다.
--   · _ai_budget(uid): model_for 안에 있던 예산 계산을 한 곳으로 뺐다.
--       화면에 보이는 %(my_entitlement)와 실제 차단(ai_gate ← model_for)이 같은 식을 쓰게 하려고.
--   · model_for: _ai_budget 사용 + resets_on 반환. 판정·핀 동작은 그대로.
--   · ai_gate: 소진 시 알려주는 날짜를 resets_on 으로(무료는 다음 달 1일 — 예전 since+30 은 31일 달에 하루 어긋났다).
--   · my_entitlement: budget {pct, over, resets_on} 추가. 원가(USD)는 내보내지 않는다.
--   ⚠️ _ai_budget 은 아무 uid 나 받는다 → anon/authenticated 실행 금지(남의 사용량 조회 구멍).

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
    v_budget_usd := coalesce((v_cfg ->> (case when v_tier = 'guest' then 'guest_month_krw' else 'free_month_krw' end))::numeric, 0) / v_krw;
    v_since := date_trunc('month', (now() at time zone 'Asia/Seoul'))::date;
    v_reset := (v_since + interval '1 month')::date;
  else
    select * into v_sub from subscriptions where user_id = p_uid and expires_at > now();
    select coalesce((v -> v_tier ->> 'price')::numeric, 0) into v_price from app_settings where k = 'ai_tiers';
    -- 🚧 모르는 채널은 '가장 불리한 요율'로 — 0.97 로 통과시키면 IAP 를 웹으로 착각해 43% 더 쓴다
    v_net := public._net_rate_of(v_sub.source);
    /* 💰 유저가 '실제로 낸 돈'에서 출발한다. ai_tiers.price 는 웹 정가라
       인앱(수수료 얹은 가격)은 _charge_price 로 환산한다(웹 4,900 → 인앱 7,000). */
    if v_sub.source in ('ios_iap','android_iap') then
      v_price := public._charge_price(v_price::int,
                   case v_sub.source when 'ios_iap' then 'ios' else 'android' end);
    end if;
    v_budget_usd := (v_price * v_net * coalesce((v_cfg ->> 'ai_share')::numeric, 0.40)) / v_krw;
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
end $function$;

revoke execute on function public._ai_budget(uuid) from public, anon, authenticated;
grant  execute on function public._ai_budget(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.model_for(p_uid uuid, p_kind text DEFAULT 'chat'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tier text; v_m jsonb; v_cfg jsonb; v_b jsonb; v_budget_usd numeric; v_spent numeric;
  v_model text; v_over boolean; v_pin_m text; v_pin_at timestamptz; v_pinned boolean := false;
begin
  select v into v_cfg from app_settings where k = 'ai_margin';
  v_tier := case when p_uid is null then 'guest' else public.tier_of(p_uid) end;
  v_m := v_cfg -> 'models' -> (case when p_kind = 'heavy' then 'heavy' else 'chat' end) -> v_tier;
  if v_m is null then
    return jsonb_build_object('model', 'deepseek-chat', 'tier', v_tier, 'downgraded', false);
  end if;

  -- 💰 예산은 _ai_budget 한 곳에서만 계산한다 — 화면에 보이는 %(my_entitlement)와 실제 차단이 같은 식이어야 한다.
  v_b := public._ai_budget(p_uid);
  v_budget_usd := (v_b ->> 'budget_usd')::numeric;
  v_spent      := (v_b ->> 'spent_usd')::numeric;

  v_over  := v_spent >= v_budget_usd;
  v_model := case when v_over then v_m ->> 'fallback' else v_m ->> 'primary' end;

  -- 🔒 세션 핀 — 로그인 유저만. 게스트는 uid 를 공유해서 핀이 남의 것과 섞인다.
  if p_uid is not null then
    select model, pinned_at into v_pin_m, v_pin_at from ai_model_pin where user_id = p_uid;
    if v_pin_m is not null
       and v_pin_at > now() - interval '30 minutes'          -- 같은 대화로 본다
       and v_pin_m in (v_m ->> 'primary', v_m ->> 'fallback') -- 등급이 그대로일 때만
       and v_spent < v_budget_usd * 1.5                       -- 초과분 상한
    then
      v_model  := v_pin_m;
      v_pinned := v_model is distinct from (case when v_over then v_m ->> 'fallback' else v_m ->> 'primary' end);
    end if;
    insert into ai_model_pin(user_id, model, pinned_at) values (p_uid, v_model, now())
      on conflict (user_id) do update set model = excluded.model, pinned_at = excluded.pinned_at;
  end if;

  return jsonb_build_object(
    'tier', v_tier, 'kind', coalesce(p_kind, 'chat'),
    'model', v_model, 'downgraded', v_over, 'pinned', v_pinned,
    'capped_turns', coalesce((v_cfg ->> 'guest_capped_turns')::int, 2),
    'spent_usd', round(v_spent, 4), 'budget_usd', round(v_budget_usd, 4),
    'since', v_b ->> 'since', 'resets_on', v_b ->> 'resets_on'
  );
end $function$;

CREATE OR REPLACE FUNCTION public.ai_gate(p_fn text, p_subject text, p_n integer DEFAULT 1, p_limit_override integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid; v_tier text; v_cfg jsonb; v_win jsonb;
  v_limit int; v_hours numeric; v_from timestamptz; v_used int; v_bucket timestamptz;
  v_oldest timestamptz; v_mf jsonb; v_cycle_end date;
begin
  if p_subject is null or p_subject = '' or p_fn is null or p_fn = '' then
    return jsonb_build_object('ok', true, 'tier', 'free');
  end if;
  p_n := greatest(coalesce(p_n, 1), 1);

  if p_subject like 'u:%' then
    begin v_uid := substring(p_subject from 3)::uuid; exception when others then v_uid := null; end;
  end if;
  v_tier := case when v_uid is null then 'guest' else public.tier_of(v_uid) end;

  -- 💰 예산 하드스톱 — 대화 계열에만 적용(창작은 강등으로 처리, 게스트는 턴 축소로 처리).
  if v_uid is not null and p_fn like 'galla-friend%' then
    v_mf := public.model_for(v_uid, 'chat');
    if coalesce((v_mf ->> 'downgraded')::boolean, false) then
      -- 무료는 다음 달 1일, 유료는 결제일+30 — _ai_budget 이 정한 날짜 하나만 쓴다(화면·말이 같은 날을 말하게)
      v_cycle_end := coalesce((v_mf ->> 'resets_on')::date, (v_mf ->> 'since')::date + 30);
      return jsonb_build_object(
        'ok', false, 'reason', 'budget', 'tier', v_tier,
        'resets_on', v_cycle_end,
        'spent_usd', v_mf -> 'spent_usd', 'budget_usd', v_mf -> 'budget_usd'
      );
    end if;
  end if;

  select v into v_cfg from app_settings where k = 'ai_tiers';
  v_win := coalesce(v_cfg -> v_tier -> 'windows' -> p_fn,
                    v_cfg -> v_tier -> 'windows' -> '_default');
  if v_win is null then
    return jsonb_build_object('ok', true, 'tier', v_tier);
  end if;

  v_limit := coalesce((v_win ->> 'n')::int, 0);
  if p_limit_override is not null then v_limit := least(v_limit, greatest(p_limit_override, 0)); end if;
  v_hours := coalesce((v_win ->> 'hours')::numeric, 5);
  if v_limit <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'tier_locked', 'tier', v_tier, 'limit', 0);
  end if;

  v_from   := now() - make_interval(secs => (v_hours * 3600)::int);
  v_bucket := date_trunc('hour', now()) + make_interval(mins => (extract(minute from now())::int / 10) * 10);

  insert into ai_window_usage (subject, fn, bucket, calls) values (p_subject, p_fn, v_bucket, 0)
  on conflict (subject, fn, bucket) do nothing;

  perform 1 from ai_window_usage
   where subject = p_subject and fn = p_fn and bucket >= v_from for update;

  select coalesce(sum(calls), 0), min(bucket) filter (where calls > 0)
    into v_used, v_oldest
    from ai_window_usage where subject = p_subject and fn = p_fn and bucket >= v_from;

  -- 🤖 레드팀 전용 계정은 턴 한도 면제(배터리가 반쪽 실행되며 가짜 결함을 만든다)
  if v_uid is not null and (public.is_redteam_uid(v_uid) or public.is_admin_uid(v_uid)) then
    v_used := 0;
  end if;
  if v_used + p_n > v_limit then
    return jsonb_build_object(
      'ok', false, 'reason', 'rate_limit', 'tier', v_tier,
      'limit', v_limit, 'used', v_used, 'hours', v_hours,
      'capped', (p_limit_override is not null),
      'resets_at', coalesce(v_oldest, v_bucket) + make_interval(secs => (v_hours * 3600)::int)
    );
  end if;

  update ai_window_usage set calls = calls + p_n
   where subject = p_subject and fn = p_fn and bucket = v_bucket;

  return jsonb_build_object('ok', true, 'tier', v_tier, 'limit', v_limit,
                            'used', v_used + p_n, 'remaining', v_limit - v_used - p_n, 'hours', v_hours);
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
  v_b jsonb; v_pct int;
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
    -- over 는 model_for.downgraded 와 같은 식(spent >= budget) — ai_gate 가 막는 바로 그 조건이다
    'budget', jsonb_build_object(
      'pct', v_pct,
      'over', coalesce((v_b ->> 'spent_usd')::numeric >= (v_b ->> 'budget_usd')::numeric, false),
      'resets_on', v_b ->> 'resets_on')
  );
end $function$
;
