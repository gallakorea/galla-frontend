-- 🐛 게스트 원가가 하나도 기록되지 않던 문제 (2026-08-08)
--
--  ai_spend의 primary key (day, user_id, fn, model) — PK 컬럼은 Postgres가 자동으로 NOT NULL을 건다.
--  그래서 user_id가 null인 게스트 호출은 insert 자체가 실패했고, logSpend는 fire-and-forget이라
--  조용히 버려졌다. 결과: 게스트 원가 = 0으로 보이고, 게스트 예산 가드도 무력.
--  (model_for도 `where user_id = p_uid`라 p_uid가 null이면 어떤 행과도 매칭되지 않았다 — 같은 뿌리.)
--
--  → 게스트를 '고정 센티넬 UUID'로 표현한다. null을 키에 넣는 설계를 피하는 게 가장 단순하고 안전.

create or replace function public.ai_guest_uid()
returns uuid language sql immutable as $$ select '00000000-0000-0000-0000-000000000000'::uuid $$;

alter table public.ai_spend alter column user_id set default public.ai_guest_uid();
update public.ai_spend set user_id = public.ai_guest_uid() where user_id is null;
drop index if exists public.ai_spend_guest_key;

create or replace function public.ai_spend_add(
  p_fn text, p_model text, p_uid uuid,
  p_in bigint default 0, p_cache bigint default 0, p_out bigint default 0)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_uid uuid := coalesce(p_uid, public.ai_guest_uid());
  v_p jsonb; v_cost numeric;
begin
  if p_model is null or p_model = '' then return jsonb_build_object('ok', false); end if;
  select coalesce(v -> p_model, v -> '_default') into v_p from app_settings where k = 'ai_model_prices';
  if v_p is null then v_p := jsonb_build_object('in', 1, 'cache', 0.1, 'out', 5); end if;

  v_cost := (coalesce(p_in, 0)    * (v_p ->> 'in')::numeric
           + coalesce(p_cache, 0) * (v_p ->> 'cache')::numeric
           + coalesce(p_out, 0)   * (v_p ->> 'out')::numeric) / 1000000.0;

  insert into ai_spend (day, user_id, fn, model, calls, in_tokens, cache_tokens, out_tokens, cost_usd)
  values (v_day, v_uid, p_fn, p_model, 1, coalesce(p_in, 0), coalesce(p_cache, 0), coalesce(p_out, 0), v_cost)
  on conflict (day, user_id, fn, model) do update set
    calls        = ai_spend.calls + 1,
    in_tokens    = ai_spend.in_tokens + excluded.in_tokens,
    cache_tokens = ai_spend.cache_tokens + excluded.cache_tokens,
    out_tokens   = ai_spend.out_tokens + excluded.out_tokens,
    cost_usd     = ai_spend.cost_usd + excluded.cost_usd;

  return jsonb_build_object('ok', true, 'cost_usd', v_cost);
end $$;

-- model_for도 같은 센티넬로 조회해야 게스트 예산이 실제로 누적된다.
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
    'spent_usd', round(v_spent, 4), 'budget_usd', round(v_budget_usd, 4), 'since', v_since
  );
end $$;

-- ⚠️ guest_month_krw는 '전체 게스트 합산' 상한이 아니라 센티넬 1행에 누적되는 총합이다.
--    게스트는 개인을 식별할 수 없으므로 이 값은 '플랫폼 전체 게스트 월 예산'으로 해석한다.
--    월 ₩60은 맛보기 몇 명분밖에 안 되니 현실적인 값으로 올린다(유입 비용).
update public.app_settings
   set v = jsonb_set(v, '{guest_month_krw}', '50000'::jsonb)
 where k = 'ai_margin';

-- 관제 함수도 센티넬 기준으로
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
    from (select unnest(array['guest','free','lite','friend','pro']) tier) t
    left join ai_spend s
      on s.day >= (now() - make_interval(days => greatest(p_days, 1)))::date
     and t.tier = case when s.user_id = public.ai_guest_uid() then 'guest'
                       else public.tier_of(s.user_id) end
    group by t.tier
  ) q;

  return jsonb_build_object('ok', true, 'days', p_days, 'by_tier', coalesce(v_out, '[]'::jsonb),
    'total_krw', (select round(coalesce(sum(cost_usd), 0) * v_krw) from ai_spend
                   where day >= (now() - make_interval(days => greatest(p_days, 1)))::date));
end $$;
