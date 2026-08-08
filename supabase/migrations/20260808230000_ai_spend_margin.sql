-- 💰 AI 원가 계측 + 마진 가드 (2026-08-08)
--
--  사장님 지시: "유료회원은 고차원 모델(클로드까지) 제공. 단 마진 확보, 절대 손해 볼 수 없음."
--
--  '턴 수' 한도만으로는 마진을 보장할 수 없다 — 같은 1턴도 대화가 길어지면 입력 토큰이 몇 배가 되고,
--  모델이 바뀌면 단가가 10배 차이난다. 그래서 **돈으로 직접 막는다**:
--    1) 모든 호출의 실제 토큰을 기록 → 원가(USD/KRW) 환산
--    2) 유저별 '이번 결제주기 원가'가 (구독료 × 허용비율)을 넘으면
--       → 서비스를 끊는 게 아니라 **저가 모델로 자동 강등**. 유저는 계속 쓰고, 우리는 역마진이 안 난다.
--
--  ⚠️ 단가·환율·허용비율은 전부 app_settings. 모델 가격이 바뀌면 코드 배포 없이 반영.

-- ─────────────────────────────────────────────────────────────
-- 1) 원가 원장 — 하루·유저·모델 단위로 뭉쳐 기록(행 폭발 방지)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.ai_spend (
  day         date not null,
  user_id     uuid,                       -- null = 게스트/시스템 크론
  fn          text not null,
  model       text not null,
  calls       int  not null default 0,
  in_tokens   bigint not null default 0,  -- 캐시 미스 입력
  cache_tokens bigint not null default 0, -- 캐시 히트 입력(단가 대폭 낮음)
  out_tokens  bigint not null default 0,
  cost_usd    numeric(12, 6) not null default 0,
  primary key (day, user_id, fn, model)
);
-- user_id가 null인 행도 PK로 묶으려면 별도 유니크 인덱스가 필요(널은 PK에서 서로 다르게 취급)
create unique index if not exists ai_spend_guest_key
  on public.ai_spend (day, fn, model) where user_id is null;
create index if not exists ai_spend_user_day_idx on public.ai_spend (user_id, day);
alter table public.ai_spend enable row level security;   -- 정책 없음 = service_role 전용

-- ─────────────────────────────────────────────────────────────
-- 2) 모델 단가표 (USD / 1M 토큰). 2026-08 기준.
-- ─────────────────────────────────────────────────────────────
insert into public.app_settings (k, v) values ('ai_model_prices', jsonb_build_object(
  -- DeepSeek — 현재 주력. 캐시 히트가 극단적으로 싸다.
  'deepseek-chat',      jsonb_build_object('in', 0.27, 'cache', 0.07, 'out', 1.10),
  'deepseek-reasoner',  jsonb_build_object('in', 0.55, 'cache', 0.14, 'out', 2.19),
  -- Claude — 유료 등급 상위 모델. 캐시 읽기는 입력가의 0.1배.
  'claude-haiku-4-5',   jsonb_build_object('in', 1.00, 'cache', 0.10, 'out', 5.00),
  'claude-sonnet-5',    jsonb_build_object('in', 3.00, 'cache', 0.30, 'out', 15.00),
  'claude-opus-5',      jsonb_build_object('in', 5.00, 'cache', 0.50, 'out', 25.00),
  -- OpenAI 폴백
  'gpt-4o-mini',        jsonb_build_object('in', 0.15, 'cache', 0.075, 'out', 0.60),
  '_default',           jsonb_build_object('in', 1.00, 'cache', 0.10, 'out', 5.00)
)) on conflict (k) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 3) 마진 정책 — 등급별 '이 유저에게 쓸 수 있는 최대 AI 원가'
--    net_rate: 결제 수수료 차감 후 실수령 비율(웹 PG ~0.97, 앱스토어 IAP 0.70)
--    ai_share: 실수령 중 AI 원가로 허용할 비율. 나머지가 마진 + 인프라.
-- ─────────────────────────────────────────────────────────────
insert into public.app_settings (k, v) values ('ai_margin', jsonb_build_object(
  'krw_per_usd', 1380,
  'net_rate',    jsonb_build_object('web_pg', 0.97, 'ios_iap', 0.70, 'android_iap', 0.70, 'admin', 1.0),
  'ai_share',    0.30,                       -- 실수령의 30%까지만 AI 원가로 씀
  -- 무료·게스트는 매출이 0이라 '유입 비용'으로 별도 상한을 KRW로 직접 건다(월 기준)
  'free_month_krw',  400,
  'guest_month_krw', 60,
  -- 등급별 모델: 예산이 남았을 때 쓰는 모델 → 예산 소진 시 강등 모델
  'models', jsonb_build_object(
    'guest',  jsonb_build_object('primary', 'deepseek-chat',  'fallback', 'deepseek-chat'),
    'free',   jsonb_build_object('primary', 'deepseek-chat',  'fallback', 'deepseek-chat'),
    'friend', jsonb_build_object('primary', 'claude-haiku-4-5', 'fallback', 'deepseek-chat'),
    'pro',    jsonb_build_object('primary', 'claude-sonnet-5',  'fallback', 'claude-haiku-4-5')
  )
)) on conflict (k) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 4) 사용량 기록 — 엣지 함수가 매 호출 후 부른다(실패해도 서비스는 안 죽게 best-effort)
-- ─────────────────────────────────────────────────────────────
create or replace function public.ai_spend_add(
  p_fn text, p_model text, p_uid uuid,
  p_in bigint default 0, p_cache bigint default 0, p_out bigint default 0)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_p jsonb; v_cost numeric;
begin
  if p_model is null or p_model = '' then return jsonb_build_object('ok', false); end if;
  select coalesce(v -> p_model, v -> '_default') into v_p from app_settings where k = 'ai_model_prices';
  if v_p is null then v_p := jsonb_build_object('in', 1, 'cache', 0.1, 'out', 5); end if;

  v_cost := (coalesce(p_in, 0)    * (v_p ->> 'in')::numeric
           + coalesce(p_cache, 0) * (v_p ->> 'cache')::numeric
           + coalesce(p_out, 0)   * (v_p ->> 'out')::numeric) / 1000000.0;

  insert into ai_spend (day, user_id, fn, model, calls, in_tokens, cache_tokens, out_tokens, cost_usd)
  values (v_day, p_uid, p_fn, p_model, 1, coalesce(p_in, 0), coalesce(p_cache, 0), coalesce(p_out, 0), v_cost)
  on conflict (day, user_id, fn, model) do update set
    calls        = ai_spend.calls + 1,
    in_tokens    = ai_spend.in_tokens + excluded.in_tokens,
    cache_tokens = ai_spend.cache_tokens + excluded.cache_tokens,
    out_tokens   = ai_spend.out_tokens + excluded.out_tokens,
    cost_usd     = ai_spend.cost_usd + excluded.cost_usd;

  return jsonb_build_object('ok', true, 'cost_usd', v_cost);
end $$;

-- ─────────────────────────────────────────────────────────────
-- 5) 마진 가드 — 이 유저에게 지금 어떤 모델을 줄 것인가
--    예산이 남았으면 primary, 넘었으면 fallback. 끊지 않는다(유저는 계속 쓴다).
-- ─────────────────────────────────────────────────────────────
create or replace function public.model_for(p_uid uuid, p_fn text default 'galla-friend')
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_tier text; v_m jsonb; v_cfg jsonb; v_sub subscriptions;
  v_price numeric; v_net numeric; v_budget_usd numeric; v_spent numeric;
  v_since date; v_krw numeric;
begin
  select v into v_cfg from app_settings where k = 'ai_margin';
  v_tier := case when p_uid is null then 'guest' else public.tier_of(p_uid) end;
  v_m := v_cfg -> 'models' -> v_tier;
  if v_m is null then
    return jsonb_build_object('model', 'deepseek-chat', 'tier', v_tier, 'downgraded', false);
  end if;
  v_krw := coalesce((v_cfg ->> 'krw_per_usd')::numeric, 1380);

  if v_tier in ('guest', 'free') then
    -- 매출이 없는 등급은 '유입 비용' 월 상한(KRW)으로 직접 제한
    v_budget_usd := coalesce((v_cfg ->> (case when v_tier = 'guest' then 'guest_month_krw' else 'free_month_krw' end))::numeric, 0) / v_krw;
    v_since := date_trunc('month', (now() at time zone 'Asia/Seoul'))::date;
  else
    select * into v_sub from subscriptions where user_id = p_uid and expires_at > now();
    select coalesce((v -> v_tier ->> 'price')::numeric, 0) into v_price from app_settings where k = 'ai_tiers';
    v_net := coalesce((v_cfg -> 'net_rate' ->> coalesce(v_sub.source, 'web_pg'))::numeric, 0.97);
    v_budget_usd := (v_price * v_net * coalesce((v_cfg ->> 'ai_share')::numeric, 0.30)) / v_krw;
    -- 결제주기 기준(구독 시작일부터). 없으면 이번 달.
    v_since := coalesce(v_sub.started_at::date, date_trunc('month', now())::date);
    -- 갱신형이면 마지막 주기 시작일로 당긴다(30일 단위)
    if v_since < (now() - interval '30 days')::date then
      v_since := ((now() at time zone 'Asia/Seoul')::date
                  - (((now() at time zone 'Asia/Seoul')::date - v_since) % 30));
    end if;
  end if;

  select coalesce(sum(cost_usd), 0) into v_spent
    from ai_spend where user_id = p_uid and day >= v_since;

  return jsonb_build_object(
    'tier', v_tier,
    'model', case when v_spent >= v_budget_usd then v_m ->> 'fallback' else v_m ->> 'primary' end,
    'downgraded', v_spent >= v_budget_usd,
    'spent_usd', round(v_spent, 4),
    'budget_usd', round(v_budget_usd, 4),
    'since', v_since
  );
end $$;

-- ─────────────────────────────────────────────────────────────
-- 6) 관제 — 등급별 실제 마진이 얼마나 나오는지 한 눈에
-- ─────────────────────────────────────────────────────────────
create or replace function public.admin_ai_margin(p_days int default 30)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_out jsonb; v_krw numeric;
begin
  if not exists (select 1 from users where id = auth.uid() and coalesce(admin_flag, false)) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  select coalesce((v ->> 'krw_per_usd')::numeric, 1380) into v_krw from app_settings where k = 'ai_margin';

  select jsonb_agg(x order by x->>'tier') into v_out from (
    select jsonb_build_object(
      'tier', t.tier,
      'users', count(distinct s.user_id),
      'cost_krw', round(coalesce(sum(s.cost_usd), 0) * v_krw),
      'calls', coalesce(sum(s.calls), 0),
      'cost_per_user_krw', round(coalesce(sum(s.cost_usd), 0) * v_krw
                                 / greatest(count(distinct s.user_id), 1))
    ) x
    from (select unnest(array['guest','free','friend','pro']) tier) t
    left join ai_spend s
      on s.day >= (now() - make_interval(days => greatest(p_days, 1)))::date
     and t.tier = case when s.user_id is null then 'guest' else public.tier_of(s.user_id) end
    group by t.tier
  ) q;

  return jsonb_build_object('ok', true, 'days', p_days, 'by_tier', coalesce(v_out, '[]'::jsonb),
    'total_krw', (select round(coalesce(sum(cost_usd), 0) * v_krw) from ai_spend
                   where day >= (now() - make_interval(days => greatest(p_days, 1)))::date));
end $$;
