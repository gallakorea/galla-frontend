-- 🔒 대화 중간에 모델이 바뀌면 갈비스가 갑자기 딴사람이 된다
--
-- model_for 는 매 턴 예산을 다시 계산한다. 그래서 예산 경계를 넘는 그 턴에
-- 모델이 바뀌고, 유저는 대화 도중에 말투·기억 활용·문장 길이가 통째로 달라지는 걸 본다.
-- "돈 냈는데 갑자기 바보가 됐다"로 읽히는 지점이 정확히 여기다.
--
-- 고치는 법: 한 번 정한 모델을 30분 동안 붙들어 둔다. 대화가 이어지는 동안은
-- 핀이 계속 갱신되므로 그 대화는 시작한 모델로 끝난다. 30분 쉬면 = 다음 세션에서 바뀐다.
--
-- ⚠️ 무한정 붙들면 예산을 넘겨도 상위 모델이 계속 나간다. 초과분을 1.5배로 막는다.
-- ⚠️ 등급이 바뀌면(결제·해지) 핀을 버린다 — 산 사람이 기다리게 하면 안 된다.

create table if not exists public.ai_model_pin (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  model     text        not null,
  pinned_at timestamptz not null default now()
);
alter table public.ai_model_pin enable row level security;   -- 직접 접근 차단(정의자 함수로만)

create or replace function public.model_for(p_uid uuid, p_kind text default 'chat')
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
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
end $function$;
