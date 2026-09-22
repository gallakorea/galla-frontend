-- 관리자 계정은 대화 월 예산 하드스톱 면제(턴 한도는 원래 면제). 사장님 계정은 subscriptions 에 companion_always(2099-12-31, source=admin_grant) 부여 — 26.9.22
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
  if v_uid is not null and p_fn like 'galla-friend%' and not public.is_admin_uid(v_uid) then  -- 관리자=예산 면제(26.9.22 사장님 지시)
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
