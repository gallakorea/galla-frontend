-- 🛑 예산 소진 시 실제로 멈춘다 (2026-08-08)
--
--  마진 가드는 '모델 강등'만 했다. 그런데 **대화는 이미 최저가 모델이라 강등할 데가 없다.**
--  결과: 대화 쪽 예산 가드가 사실상 아무것도 막지 못했다.
--
--  이론상 최대치(5시간 창을 하루 4.8회 꽉 채움):
--    라이트 5,760턴/월 = ₩23,386 (매출 2,900원 대비 8.1배 적자)
--    프렌드 14,400턴/월 = ₩58,464 (8.5배)
--    프로   36,000턴/월 = ₩146,160 (9.8배)
--  창 한도만으로는 "절대 손해 볼 수 없다"는 조건을 지킬 수 없다 → 돈으로 막아야 한다.
--
--  그래서 결제주기 원가가 예산을 넘으면 **정직하게 멈춘다**(구독형 사용량 제한의 정석).
--  · 언제 풀리는지(주기 초기화일)를 함께 알려준다 — 막연한 차단이 제일 나쁘다.
--  · 창작(heavy)은 여전히 '강등'으로 처리한다(내려갈 모델이 있으니 끊을 이유가 없다).

create or replace function public.ai_gate(
  p_fn text, p_subject text, p_n int default 1, p_limit_override int default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
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
      v_cycle_end := ((v_mf ->> 'since')::date + 30);
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
