-- 🎚 게스트 맛보기 소프트 캡 (2026-08-08, 사장님 결정)
--
--  플랫폼 전체 맛보기 예산(ai_margin.guest_month_krw)을 넘겨도 체험을 '잠그지' 않는다.
--  대신 맛보기 턴 수를 5턴 → 2턴으로 줄인다. 유입은 계속 살리면서 비용은 반 이하로.
--  (게스트는 이미 최저가 모델이라 '모델 강등'으로는 방어가 안 된다 — 턴 수가 유일한 레버.)
--
--  ai_gate에 한도 오버라이드 인자를 추가한다. 호출부(엣지)가 '예산 초과 상태'를 판단해서 넘긴다.

create or replace function public.ai_gate(
  p_fn text, p_subject text, p_n int default 1, p_limit_override int default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid; v_tier text; v_cfg jsonb; v_win jsonb;
  v_limit int; v_hours numeric; v_from timestamptz; v_used int; v_bucket timestamptz;
  v_oldest timestamptz;
begin
  if p_subject is null or p_subject = '' or p_fn is null or p_fn = '' then
    return jsonb_build_object('ok', true, 'tier', 'free');
  end if;
  p_n := greatest(coalesce(p_n, 1), 1);

  if p_subject like 'u:%' then
    begin v_uid := substring(p_subject from 3)::uuid; exception when others then v_uid := null; end;
  end if;
  v_tier := case when v_uid is null then 'guest' else public.tier_of(v_uid) end;

  select v into v_cfg from app_settings where k = 'ai_tiers';
  v_win := coalesce(v_cfg -> v_tier -> 'windows' -> p_fn,
                    v_cfg -> v_tier -> 'windows' -> '_default');
  if v_win is null then
    return jsonb_build_object('ok', true, 'tier', v_tier);
  end if;

  v_limit := coalesce((v_win ->> 'n')::int, 0);
  -- 오버라이드는 '더 조이는 방향'으로만 적용한다(실수로 한도가 늘어나는 일 방지)
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
end $$;

-- 예산 초과 시 적용할 축소 한도(설정으로 뺀다)
update public.app_settings
   set v = jsonb_set(v, '{guest_capped_turns}', '2'::jsonb)
 where k = 'ai_margin';

-- model_for가 '예산 초과 시 몇 턴으로 줄일지'를 함께 알려준다(엣지에 하드코딩하지 않기 위해).
create or replace function public.model_for(p_uid uuid, p_kind text default 'chat')
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_tier text; v_m jsonb; v_cfg jsonb; v_sub subscriptions;
  v_price numeric; v_net numeric; v_budget_usd numeric; v_spent numeric;
  v_since date; v_krw numeric; v_key uuid;
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
    v_net := coalesce((v_cfg -> 'net_rate' ->> coalesce(v_sub.source, 'web_pg'))::numeric, 0.97);
    v_budget_usd := (v_price * v_net * coalesce((v_cfg ->> 'ai_share')::numeric, 0.40)) / v_krw;
    v_since := coalesce(v_sub.started_at::date, date_trunc('month', now())::date);
    if v_since < (now() - interval '30 days')::date then
      v_since := ((now() at time zone 'Asia/Seoul')::date
                  - (((now() at time zone 'Asia/Seoul')::date - v_since) % 30));
    end if;
  end if;

  select coalesce(sum(cost_usd), 0) into v_spent
    from ai_spend where user_id = v_key and day >= v_since;

  return jsonb_build_object(
    'tier', v_tier, 'kind', coalesce(p_kind, 'chat'),
    'model', case when v_spent >= v_budget_usd then v_m ->> 'fallback' else v_m ->> 'primary' end,
    'downgraded', v_spent >= v_budget_usd,
    'capped_turns', coalesce((v_cfg ->> 'guest_capped_turns')::int, 2),
    'spent_usd', round(v_spent, 4), 'budget_usd', round(v_budget_usd, 4), 'since', v_since
  );
end $$;
