-- 💳 구독 IAP 배선 — 스토어 영수증 → 구독 부여, 그리고 그 뒤의 생애주기
--
-- 여태 verify-iap 는 GC 충전(소모품)만 처리했다. 구독은 관리자가 손으로 켜는 것 말고는
-- 켤 방법이 없었다. 애플/구글 결제를 붙이려면 세 가지가 더 필요하다:
--   ① 상품ID → 등급 매핑을 '서버가' 갖는다. 클라가 보내는 등급은 절대 믿지 않는다.
--   ② 구독 상태를 구분한다. '해지 예약'과 '이미 만료'는 완전히 다른 상태인데
--      지금은 expires_at 하나뿐이라 유저에게 뭘 보여줘야 할지 알 수 없다.
--   ③ 스토어가 나중에 보내는 사건(갱신·해지·유예·환불)을 받아 반영한다.
--      결제는 한 번이지만 구독은 계속 변한다 — 이걸 안 받으면 장부가 첫날에서 멈춘다.

-- ── ① 상품 매핑 ───────────────────────────────────────────────────────────
create table if not exists public.sub_products (
  channel     text not null check (channel in ('ios','android')),
  product_id  text not null,
  tier        text not null,
  days        int  not null default 30,
  active      bool not null default true,
  updated_at  timestamptz not null default now(),
  primary key (channel, product_id)
);
alter table public.sub_products enable row level security;
-- 읽기는 누구나(요금제 화면이 상품ID를 알아야 결제를 건다). 쓰기는 서비스롤만.
drop policy if exists sub_products_read on public.sub_products;
create policy sub_products_read on public.sub_products for select using (active);

-- ── ② 구독 상태 ───────────────────────────────────────────────────────────
--    active  : 정상 — 다음 결제일에 갱신된다
--    canceled: 해지 예약 — 만료일까진 그대로 쓴다(환불 아님)
--    grace   : 결제 실패 유예 — 카드 문제 등. 스토어가 재시도 중이라 아직 살아 있다
--    expired : 끝남
--    refunded: 환불됨 — 즉시 끊는다
alter table public.subscriptions
  add column if not exists state text not null default 'active',
  add column if not exists renews_at timestamptz,
  add column if not exists last_event text,
  add column if not exists last_event_at timestamptz;
do $$ begin
  alter table public.subscriptions
    add constraint subscriptions_state_chk
    check (state in ('active','canceled','grace','expired','refunded'));
exception when duplicate_object then null; end $$;

-- ── ③ 영수증 → 구독. verify-iap 가 스토어 API 로 검증한 뒤에만 부른다 ──────
create or replace function public.apply_sub_purchase(
  p_user uuid, p_channel text, p_product text, p_ext_id text,
  p_expires timestamptz default null, p_auto_renew boolean default true
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_row sub_products; v_src text; v_exp timestamptz; v_res jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    return jsonb_build_object('ok',false,'reason','forbidden');
  end if;

  select * into v_row from sub_products
   where channel = p_channel and product_id = p_product and active;
  if v_row is null then
    -- 모르는 상품이면 등급을 짐작하지 않는다. 짐작이 곧 공짜 구독이다.
    return jsonb_build_object('ok',false,'reason','unknown_product','product',p_product);
  end if;

  v_src := case p_channel when 'ios' then 'ios_iap' else 'android_iap' end;
  -- 스토어가 만료일을 주면 그걸 쓴다(연장·체험 기간이 상품표와 다를 수 있다).
  v_exp := coalesce(p_expires, now() + make_interval(days => v_row.days));

  insert into subscriptions (user_id, tier, expires_at, source, ext_id, auto_renew,
                             state, renews_at, last_event, last_event_at)
  values (p_user, v_row.tier, v_exp, v_src, p_ext_id, coalesce(p_auto_renew,true),
          'active', v_exp, 'purchase', now())
  on conflict (user_id) do update set
    tier = excluded.tier,
    -- 남은 기간이 있으면 이어붙인다(중복결제 손해 방지) — 스토어 만료일이 더 뒤면 그걸 따른다
    expires_at = greatest(excluded.expires_at, subscriptions.expires_at),
    source = excluded.source, ext_id = coalesce(excluded.ext_id, subscriptions.ext_id),
    auto_renew = excluded.auto_renew, state = 'active',
    renews_at = excluded.renews_at, last_event = 'purchase', last_event_at = now(),
    updated_at = now();

  perform _gc_sub_grant(p_user, v_row.tier, (select expires_at from subscriptions where user_id = p_user));

  select jsonb_build_object('ok',true,'tier',v_row.tier,'source',v_src,
    'expires_at',(select expires_at from subscriptions where user_id = p_user))
    into v_res;
  return v_res;
end $$;

-- ── ④ 스토어 사건 반영(갱신·해지·유예·환불) ────────────────────────────────
create or replace function public.apply_sub_event(
  p_ext_id text, p_event text, p_expires timestamptz default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_state text; v_exp timestamptz;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    return jsonb_build_object('ok',false,'reason','forbidden');
  end if;
  select user_id, expires_at into v_uid, v_exp from subscriptions where ext_id = p_ext_id;
  if v_uid is null then return jsonb_build_object('ok',false,'reason','no_sub'); end if;

  v_state := case p_event
    when 'renew'    then 'active'
    when 'cancel'   then 'canceled'   -- 해지 '예약'. 만료일까진 그대로 쓴다
    when 'grace'    then 'grace'
    when 'expire'   then 'expired'
    when 'refund'   then 'refunded'
    when 'resubscribe' then 'active'
    else null end;
  if v_state is null then return jsonb_build_object('ok',false,'reason','unknown_event','event',p_event); end if;

  update subscriptions set
    state = v_state,
    -- 환불·만료는 즉시 끊는다. 그 외엔 스토어가 준 만료일로 민다.
    expires_at = case when v_state in ('refunded','expired') then least(expires_at, now())
                      else coalesce(p_expires, expires_at) end,
    renews_at = case when v_state = 'active' then coalesce(p_expires, renews_at) else null end,
    auto_renew = (v_state = 'active'),
    last_event = p_event, last_event_at = now(), updated_at = now()
  where user_id = v_uid;

  return jsonb_build_object('ok',true,'state',v_state,'user',v_uid);
end $$;

revoke all on function public.apply_sub_purchase(uuid,text,text,text,timestamptz,boolean) from public, anon, authenticated;
revoke all on function public.apply_sub_event(text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.apply_sub_purchase(uuid,text,text,text,timestamptz,boolean) to service_role;
grant execute on function public.apply_sub_event(text,text,timestamptz) to service_role;
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
    /* 💰 유저가 '실제로 낸 돈'에서 출발해야 한다.
       ai_tiers.price 는 웹 정가다. 인앱은 스토어 수수료를 얹어 더 비싸게 팔린다
       (웹 4,900 → 인앱 7,000). 웹 정가에 0.70 을 곱하면 인앱 구독자의 예산이
       실제 실수령(₩4,900)보다 30% 적게 잡힌다 — 돈은 더 받고 모델은 먼저 강등된다. */
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
-- ⑤ model_for: 인앱 구독은 '실제 낸 돈(스토어 가격)'에서 실수령을 계산한다(위 정의에 반영)
