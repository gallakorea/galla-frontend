-- 🚧 결제 채널을 잘못 적으면 AI 예산이 조용히 43% 부풀어 오른다
--
-- model_for 는 subscriptions.source 로 ai_margin.net_rate 를 찾아 '실수령'을 정하고,
-- 거기에 ai_share 를 곱해 그 유저의 AI 예산을 만든다. 그런데 지금은:
--   · start_subscription 의 p_source 기본값이 'admin' → 실수령 1.0 (전액 우리 것)
--   · 표에 없는 값이면 coalesce(..., 0.97) → 웹 요율로 조용히 통과
-- IAP 구독을 p_source 없이 켜거나 'ios' 로 오타 내면 애플이 30% 떼간 걸 모른 채 예산을 크게 잡는다.
-- 인앱 ₩1,500 기준 정상 ₩682 → admin 이면 ₩975(+43%), 오타면 ₩946(+39%). 에러 없이 그냥 더 쓴다.
-- 구독 IAP 배선을 붙이기 '전에' 막아둔다.

-- ① 모르는 채널은 '가장 불리한 요율'로 본다. 0.97 로 통과시키면 초과지출이 조용히 난다.
create or replace function public._net_rate_of(p_source text) returns numeric
language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select (v -> 'net_rate' ->> coalesce(p_source, 'web_pg'))::numeric from app_settings where k = 'ai_margin'),
    (select min((e.value)::text::numeric) from app_settings a, lateral jsonb_each(a.v -> 'net_rate') e where a.k = 'ai_margin'),
    0.70);
$$;

-- ② start_subscription 은 net_rate 에 없는 채널을 거부한다(오타는 즉시 실패).
--    ⚠️ 원본 그대로 두고 검증 한 블록만 얹는다 — 특히 auth.role() 검사는 절대 빼면 안 된다
--       (SECURITY DEFINER 안에서 current_user 는 소유자로 평가되므로 권한 판정은 auth.role() 로만).
create or replace function public.start_subscription(
  p_uid uuid, p_tier text, p_days integer default 30,
  p_source text default 'admin', p_ext_id text default null, p_auto_renew boolean default false
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_base timestamptz; v_exp timestamptz; v_gc int; v_rate numeric;
begin
  -- service_role 전용(엣지 함수의 PG/IAP 검증 통과분만 도달).
  if coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  -- 가격표에 있으면 판다. 목록을 또 적으면 또 어긋난다(라이트가 그래서 못 팔렸다).
  if not _is_paid_tier(p_tier) then
    return jsonb_build_object('ok', false, 'reason', 'bad_tier', 'tier', p_tier);
  end if;
  -- 🚧 채널 검증 — 표에 없는 채널은 받지 않는다. 조용한 오타가 곧 초과지출이다.
  select (v -> 'net_rate' ->> p_source)::numeric into v_rate from app_settings where k = 'ai_margin';
  if v_rate is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_source', 'source', p_source,
      'hint', 'ai_margin.net_rate 에 있는 채널만: admin·web_pg·ios_iap·android_iap');
  end if;

  -- 남은 기간이 있으면 이어붙인다(중복결제 시 손해 방지)
  select greatest(coalesce(expires_at, now()), now()) into v_base from subscriptions where user_id = p_uid;

  insert into subscriptions (user_id, tier, expires_at, source, ext_id, auto_renew)
  values (p_uid, p_tier, coalesce(v_base, now()) + make_interval(days => greatest(p_days, 1)),
          p_source, p_ext_id, p_auto_renew)
  on conflict (user_id) do update set
    tier       = excluded.tier,
    expires_at = excluded.expires_at,
    source     = excluded.source,
    ext_id     = coalesce(excluded.ext_id, subscriptions.ext_id),
    auto_renew = excluded.auto_renew,
    updated_at = now()
  returning expires_at into v_exp;

  -- 포함 크레딧은 0 이 되었지만 호출은 남긴다 — 값이 0 이면 아무 일도 하지 않고,
  -- 나중에 다시 얹기로 하면 app_settings 한 줄로 되살아난다.
  v_gc := _gc_sub_grant(p_uid, p_tier, v_exp);

  return jsonb_build_object('ok', true, 'tier', p_tier, 'expires_at', v_exp,
                            'credit_gc', v_gc, 'source', p_source, 'net_rate', v_rate);
end $function$;
CREATE OR REPLACE FUNCTION public.model_for(p_uid uuid, p_kind text DEFAULT 'chat'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tier text; v_m jsonb; v_cfg jsonb; v_sub subscriptions;
  v_price numeric; v_net numeric; v_budget_usd numeric; v_spent numeric;
  v_since date; v_krw numeric; v_key uuid;
  v_model text; v_over boolean; v_pin_m text; v_pin_at timestamptz; v_pinned boolean := false;
begin
  select v into v_cfg from app_settings where k = 'ai_margin';
  v_tier := case when p_uid is null then 'guest' else public.tier_of(p_uid) end;
  v_key  := coalesce(p_uid, public.ai_guest_uid());
  v_m := v_cfg -> 'models' -> (case when p_kind = 'heavy' then 'heavy' else 'chat' end) -> v_tier;
  if v_m is null then
    return jsonb_build_object('model', 'deepseek-chat', 'tier', v_tier, 'downgraded', false);
  end if;
  v_krw := coalesce((v_cfg ->> 'krw_per_usd')::numeric, 1380);

  if v_tier in ('guest', 'free') then
    v_budget_usd := coalesce((v_cfg ->> (case when v_tier = 'guest' then 'guest_month_krw' else 'free_month_krw' end))::numeric, 0) / v_krw;
    v_since := date_trunc('month', (now() at time zone 'Asia/Seoul'))::date;
  else
    select * into v_sub from subscriptions where user_id = p_uid and expires_at > now();
    select coalesce((v -> v_tier ->> 'price')::numeric, 0) into v_price from app_settings where k = 'ai_tiers';
    -- 🚧 모르는 채널은 '가장 불리한 요율'로 — 0.97 로 통과시키면 IAP 를 웹으로 착각해 43% 더 쓴다
    v_net := public._net_rate_of(v_sub.source);
    v_budget_usd := (v_price * v_net * coalesce((v_cfg ->> 'ai_share')::numeric, 0.40)) / v_krw;
    v_since := coalesce(v_sub.started_at::date, date_trunc('month', now())::date);
    if v_since < (now() - interval '30 days')::date then
      v_since := ((now() at time zone 'Asia/Seoul')::date
                  - (((now() at time zone 'Asia/Seoul')::date - v_since) % 30));
    end if;
  end if;

  select coalesce(sum(cost_usd), 0) into v_spent
    from ai_spend where user_id = v_key and day >= v_since;

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
    'spent_usd', round(v_spent, 4), 'budget_usd', round(v_budget_usd, 4), 'since', v_since
  );
end $function$
;
-- ③ model_for 도 같은 헬퍼를 쓰게 한다(위 정의에 반영)
