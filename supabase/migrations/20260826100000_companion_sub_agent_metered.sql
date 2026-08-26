-- =========================================================
-- 상품 정리 — 컴패니언은 구독(쓰는 양으로 3단), 에이전트는 종량
--
--   컴패니언 (구독)   대화 · 기억 · 음성 · 광고 없음 · 앱 조작 대행
--                     쓰는 양이 다르니 월 포함 턴수로 셋으로 나눈다.
--   에이전트 (종량)   만드는 것 전부. 이용권이 아니다 — 쓴 만큼 낸다.
--
-- 원가가 이 선을 그었다
--   대화는 턴당 ₩1.46(딥시크 청구서 대조, 캐시히트 97%) 로 예측된다 → 정액으로 묶인다.
--   제작은 편당 ₩13.5 에서 생성 초당까지 튄다 → 정액에 넣었더니 한도 소진 시
--   13.2배 적자였다(실측). 튀는 쪽만 종량으로 뺀다.
--
-- ⚠️ 지금까지 한도가 '5시간에 몇 번'뿐이었다 — 폭주 방어와 가격 차등을 한 장치로 하고 있었다.
--    사람은 "한 달에 얼마나 쓰나"로 생각하지 5시간 단위로 생각하지 않는다. 둘을 나눈다:
--      · 월 포함 턴수(monthly_turns) = 값을 가르는 장치
--      · 5시간 창(ai_gate)           = 봇·스크립트 폭주만 막는 방어선(단마다 같다)
--
-- ⚠️ 포함량을 넘겨도 막지 않는다. GC 로 계속한다.
--    실사용 분포를 아직 모른다(사용자가 없다) — 포함량은 추측이다.
--    막아 버리면 우리 추측이 틀렸을 때 그 값을 사용자가 문다. 넘으면 종량으로 이어지면
--    어느 단을 골라도 손해가 없고, 실제 분포가 쌓이면 그때 포함량을 조정하면 된다.
--
-- ⚠️ 맛보기 없음. 기능은 볼 수 있고, 만들 때 낸다.
--    작업대·업로드·컷 바꾸기는 우리 원가가 0이라 막지 않는다.
--    그래서 포함 GC 도 두지 않는다 — 얹어 주면 그게 곧 맛보기가 되어 원칙과 어긋난다.
--
-- 옛 이름(라이트/프렌드/프로)도 버린다
--   ① '프렌드'가 갈비스와 충돌했다 — ai_spend 한 줄에 fn='galla-friend', tier='friend' 가 나란히 찍혔다.
--   ② 'tier' 를 유료(tier_of)와 갈라이안 활동등급(_tier_lv)이 나눠 써서 사람도 코드도 헷갈렸다.
--   ③ sft_samples.brain 은 이미 companion/agent 를 쓰고 있었다 — 등급 이름만 겉돌았다.
-- =========================================================

-- ── 1. 등급 목록을 코드에서 걷어낸다 ──────────────────────
-- 키가 네 함수에 흩어져 있었고, 그래서 start_subscription 이 'lite' 를 빠뜨려
-- 라이트를 결제해도 부여가 거부됐다(가격표엔 있는데 팔 수 없는 등급이었다).
create or replace function public._tier_order()
returns text[] language sql immutable as $$
  select array['guest','free','companion_sometimes','companion_daily','companion_always'];
$$;

-- 파는 이용권인가? 가격표가 진실이다. 목록을 또 적지 않는다.
create or replace function public._is_paid_tier(p_tier text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select (v ? p_tier) from app_settings where k = 'ai_tiers'), false
  ) and coalesce(p_tier, '') not in ('guest', 'free');
$$;

-- ── 2. 가격표 — 쓰는 양으로 셋 ────────────────────────────
-- 옛 '프렌드'의 창을 바탕으로 삼되, 5시간 창은 이제 폭주 방어라 세 단이 같다.
-- 값을 가르는 건 monthly_turns 다.
--
-- ⚠️ price 는 비워 둔다(null = 미정). 옛 3단 값은 창작이 포함된 값이라 지금 맞지 않고,
--    여기서 임의로 채우면 그게 그대로 가격이 된다. 원가만 적어 둔다:
--      가끔  월  300턴 → 원가 ₩438
--      매일  월  900턴 → 원가 ₩1,314
--      종일  월 3,000턴 → 원가 ₩4,380
--    (턴당 ₩1.46 실측 × 포함량. 여기에 마진 배수를 곱하면 가격이다.)
--
-- 창작 함수의 횟수 한도는 뺀다 — 종량인데 횟수까지 막으면 '돈을 내고도 못 쓰는' 상황이 된다.
-- ai_gate 는 규칙 없는 기능을 '제한 없음'으로 통과시키므로 빼는 것으로 족하다.
update app_settings set v = jsonb_build_object(
  'guest', v -> 'guest',
  'free',  jsonb_set(
             jsonb_set(v -> 'free', '{windows}',
               (v -> 'free' -> 'windows')
                 - 'generate-sticker' - 'generate-thumbnail' - 'generate-video'),
             '{monthly_turns}', '150'::jsonb),
  'companion_sometimes', jsonb_build_object(
      'label', '컴패니언 · 가끔', 'price', null, 'monthly_turns', 300,
      'cost_basis', '월 300턴 × ₩1.46 = ₩438',
      'windows', jsonb_build_object('galla-friend', jsonb_build_object('n', 200, 'hours', 5)),
      'features', jsonb_build_array('memory','voice','no_ads','app_control')),
  'companion_daily', jsonb_build_object(
      'label', '컴패니언 · 매일', 'price', null, 'monthly_turns', 900,
      'cost_basis', '월 900턴 × ₩1.46 = ₩1,314',
      'windows', jsonb_build_object('galla-friend', jsonb_build_object('n', 200, 'hours', 5)),
      'features', jsonb_build_array('memory','voice','no_ads','app_control')),
  'companion_always', jsonb_build_object(
      'label', '컴패니언 · 종일', 'price', null, 'monthly_turns', 3000,
      'cost_basis', '월 3,000턴 × ₩1.46 = ₩4,380',
      'windows', jsonb_build_object('galla-friend', jsonb_build_object('n', 200, 'hours', 5)),
      'features', jsonb_build_array('memory','voice','no_ads','app_control'))
) where k = 'ai_tiers' and (v ? 'friend' or v ? 'companion');

-- ── 3. 포함 크레딧 없음 ───────────────────────────────────
-- 창작이 구독 밖으로 나갔으므로 '이중 과금'이 없다 → 얹어 줄 이유가 사라졌다.
-- 그리고 맛보기를 두지 않기로 했으므로 포함 GC 는 곧 맛보기가 되어 원칙과 어긋난다.
-- ⚠️ 이미 받은 사람의 sub_gc 는 건드리지 않는다 — 준 것을 소급해 뺏으면 그게 사고다.
--    만료와 함께 자연히 소멸한다(sub_gc_expires).
update app_settings set v = jsonb_build_object(
  'companion_sometimes', 0, 'companion_daily', 0, 'companion_always', 0
) where k = 'sub_credits';

-- ── 4. 이미 있는 구독 행 ──────────────────────────────────
-- 제약을 먼저 풀지 않으면 update 가 옛 제약에 걸린다.
alter table public.subscriptions drop constraint if exists subscriptions_tier_check;

-- 셋 다 컴패니언으로 모은다. 결제로 산 사람은 아직 없다(관리자 부여분만) —
-- 그래서 지금 옮길 수 있고, 스토어에 상품을 올린 뒤엔 못 옮긴다.
-- 옛 등급은 대화량이 가장 가까운 단으로 옮긴다(라이트·프렌드 → 매일, 프로 → 종일).
update public.subscriptions set tier = case
  when tier in ('pro','companion_plus') then 'companion_always'
  else 'companion_daily' end,
  updated_at = now()
 where tier not in ('companion_sometimes','companion_daily','companion_always');

alter table public.subscriptions add constraint subscriptions_tier_check
  check (tier in ('companion_sometimes','companion_daily','companion_always'));

-- gc_ledger 의 옛 사유('gc:sub_credit:friend')는 건드리지 않는다 —
-- 원장은 그때 무슨 일이 있었는지의 기록이고, 소급해 고치면 그게 더 나쁘다.

-- ── 5. 구독 부여 — 허용 목록 대신 가격표를 본다 ───────────
create or replace function public.start_subscription(
  p_uid uuid, p_tier text, p_days integer default 30, p_source text default 'admin',
  p_ext_id text default null, p_auto_renew boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_base timestamptz; v_exp timestamptz; v_gc int;
begin
  -- service_role 전용(엣지 함수의 PG/IAP 검증 통과분만 도달). SECURITY DEFINER 안에서 current_user는
  -- 소유자로 평가되므로 권한 판정은 반드시 auth.role() 로 한다.
  if coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  -- 가격표에 있으면 판다. 목록을 또 적으면 또 어긋난다(라이트가 그래서 못 팔렸다).
  if not _is_paid_tier(p_tier) then
    return jsonb_build_object('ok', false, 'reason', 'bad_tier', 'tier', p_tier);
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

  return jsonb_build_object('ok', true, 'tier', p_tier, 'expires_at', v_exp, 'credit_gc', v_gc);
end $$;

create or replace function public.admin_grant_subscription(
  p_uid uuid, p_tier text, p_days int default 30)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_base timestamptz; v_exp timestamptz;
begin
  if not _is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_tier is null then                      -- 회수: 즉시 만료
    delete from subscriptions where user_id = p_uid;
    return jsonb_build_object('ok', true, 'tier', null);
  end if;
  if not _is_paid_tier(p_tier) then
    return jsonb_build_object('ok', false, 'reason', 'bad_tier', 'tier', p_tier);
  end if;

  select greatest(coalesce(expires_at, now()), now()) into v_base from subscriptions where user_id = p_uid;
  insert into subscriptions (user_id, tier, expires_at, source, auto_renew)
  values (p_uid, p_tier, coalesce(v_base, now()) + make_interval(days => greatest(p_days, 1)), 'admin', false)
  on conflict (user_id) do update set
    tier = excluded.tier, expires_at = excluded.expires_at, source = 'admin', updated_at = now()
  returning expires_at into v_exp;

  return jsonb_build_object('ok', true, 'tier', p_tier, 'expires_at', v_exp);
end $$;

-- ── 6. 목록을 들고 있던 나머지 한 곳 ──────────────────────
-- 유료인지 판정하는 데 키 목록이 필요 없다. 만료 전이면 유료다.
create or replace function public.tiers_of(p_uids uuid[])
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_object_agg(s.user_id, s.tier), '{}'::jsonb)
    from subscriptions s
   where s.user_id = any(p_uids)
     and s.expires_at > now();
$$;
grant execute on function public.tiers_of(uuid[]) to anon, authenticated;

-- ── 7. 가드 ───────────────────────────────────────────────
do $$
begin
  if exists (select 1 from app_settings where k = 'ai_tiers'
              and (v ? 'lite' or v ? 'friend' or v ? 'pro')) then
    raise exception '가격표에 옛 등급이 남아 있다';
  end if;
  if exists (select 1 from subscriptions
              where tier not in ('companion_sometimes','companion_daily','companion_always')) then
    raise exception '구독 행 정리 실패 — 옛 등급이 남아 있다';
  end if;
  if not _is_paid_tier('companion_daily') then
    raise exception 'companion_daily 가 파는 이용권으로 인식되지 않는다';
  end if;
  -- 포함량이 없는 단이 있으면 '얼마나 쓸 수 있는지'를 말해 줄 수 없다
  if exists (select 1 from app_settings where k = 'ai_tiers'
              and (v -> 'companion_daily' -> 'monthly_turns') is null) then
    raise exception '월 포함 턴수가 비어 있다';
  end if;
  if _is_paid_tier('agent') then
    raise exception '에이전트는 이용권이 아니다 — 종량(GC)이어야 한다';
  end if;
  -- 종량인데 횟수 한도가 남아 있으면 돈을 내고도 못 쓴다
  if exists (select 1 from app_settings where k = 'ai_tiers'
              and ((v -> 'companion_always' -> 'windows') ? 'generate-video'
                or (v -> 'free' -> 'windows') ? 'generate-video')) then
    raise exception '창작 횟수 한도가 남아 있다 — 종량 경로는 GC 만 봐야 한다';
  end if;
end $$;

comment on function public._tier_order() is
  '표시 순서. 이용권 키를 코드에 적는 곳은 여기 하나뿐이어야 한다 — 네 군데 흩어져 있어 라이트가 누락됐었다.';
comment on function public._is_paid_tier(text) is
  '가격표(app_settings.ai_tiers)에 있고 guest/free 가 아니면 파는 이용권. 에이전트는 여기 없다 — 종량이다.';
comment on table public.subscriptions is
  '컴패니언 구독(가끔·매일·종일). 제작(에이전트)은 구독이 아니라 GC 종량이다 — 원가가 튀어서 정액에 못 넣는다.';

-- ── 8. 관제 통계 — 등급 배열이 여기도 박혀 있었다 ─────────
-- 표시용이라 동작을 가르지 않지만, 옛 키가 남으면 관제센터가 빈 줄만 보여준다.
-- 매출은 구독료 + GC 판매 둘 다 봐야 한다 — 이제 수입이 두 갈래다.
create or replace function public.admin_ai_margin(p_days int default 30)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_krw numeric; v_cfg jsonb; v_tiers jsonb; v_since date; v_d int;
  v_by_tier jsonb; v_by_model jsonb; v_top jsonb;
  v_cost numeric; v_sub_rev numeric; v_gc_rev numeric;
begin
  if not _is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  v_d := greatest(coalesce(p_days, 30), 1);
  v_since := (now() - make_interval(days => v_d))::date;
  select v into v_cfg from app_settings where k = 'ai_margin';
  select v into v_tiers from app_settings where k = 'ai_tiers';
  v_krw := coalesce((v_cfg ->> 'krw_per_usd')::numeric, 1380);

  with spend as (
    select case when s.user_id = public.ai_guest_uid() then 'guest' else public.tier_of(s.user_id) end tier,
           s.user_id, sum(s.cost_usd) c, sum(s.calls) calls
      from ai_spend s where s.day >= v_since group by 1, 2
  ), agg as (
    select tier, count(*) users, sum(c) * v_krw cost_krw, sum(calls) calls from spend group by tier
  ), rev as (
    select sub.tier,
           sum(coalesce((v_tiers -> sub.tier ->> 'price')::numeric, 0)
               * coalesce((v_cfg -> 'net_rate' ->> coalesce(sub.source, 'web_pg'))::numeric, 0.97)
               * (v_d / 30.0)) rev_krw
      from subscriptions sub where sub.expires_at > now() group by sub.tier
  )
  select jsonb_agg(jsonb_build_object(
    'tier', t.tier,
    'label', coalesce(v_tiers -> t.tier ->> 'label', t.tier),
    'users', coalesce(a.users, 0),
    'calls', coalesce(a.calls, 0),
    'cost_krw', round(coalesce(a.cost_krw, 0)),
    'revenue_krw', round(coalesce(r.rev_krw, 0)),
    'margin_krw', round(coalesce(r.rev_krw, 0) - coalesce(a.cost_krw, 0)),
    'cost_per_user_krw', round(coalesce(a.cost_krw, 0) / greatest(coalesce(a.users, 0), 1))
  ) order by array_position(public._tier_order(), t.tier))
  into v_by_tier
  from (select unnest(public._tier_order()) tier) t
  left join agg a on a.tier = t.tier
  left join rev r on r.tier = t.tier;

  select jsonb_agg(x order by (x->>'cost_krw')::numeric desc) into v_by_model from (
    select jsonb_build_object('model', model, 'calls', sum(calls),
      'cost_krw', round(sum(cost_usd) * v_krw), 'out_tokens', sum(out_tokens)) x
    from ai_spend where day >= v_since group by model
  ) q;

  select jsonb_agg(x order by (x->>'cost_krw')::numeric desc) into v_top from (
    select jsonb_build_object(
      'user_id', s.user_id,
      -- 닉네임이 없다고 전부 게스트로 표기하면 실제 회원이 게스트로 오인된다(탈퇴·프로필 미생성과 구분).
      'nickname', case when s.user_id = public.ai_guest_uid() then '(게스트 합산)'
                       else coalesce((select u.nickname from users u where u.id = s.user_id), '(탈퇴·미상)') end,
      'tier', case when s.user_id = public.ai_guest_uid() then 'guest' else public.tier_of(s.user_id) end,
      'calls', sum(s.calls), 'cost_krw', round(sum(s.cost_usd) * v_krw)) x
    from ai_spend s where s.day >= v_since group by s.user_id
    order by sum(s.cost_usd) desc limit 10
  ) q;

  select coalesce(sum(cost_usd), 0) * v_krw into v_cost from ai_spend where day >= v_since;
  select coalesce(sum(coalesce((v_tiers -> sub.tier ->> 'price')::numeric, 0)
           * coalesce((v_cfg -> 'net_rate' ->> coalesce(sub.source, 'web_pg'))::numeric, 0.97)
           * (v_d / 30.0)), 0) into v_sub_rev
    from subscriptions sub where sub.expires_at > now();
  -- 제작 매출 = 실제로 결제된 GC. 구독료와 섞으면 어느 쪽이 버는지 안 보인다.
  select coalesce(sum(krw), 0) into v_gc_rev
    from gc_charges where status = 'paid' and paid_at >= (now() - make_interval(days => v_d));

  return jsonb_build_object('ok', true, 'days', v_d,
    'by_tier', coalesce(v_by_tier, '[]'::jsonb),
    'by_model', coalesce(v_by_model, '[]'::jsonb),
    'top_users', coalesce(v_top, '[]'::jsonb),
    'total_cost_krw', round(v_cost),
    'sub_revenue_krw', round(v_sub_rev),
    'gc_revenue_krw', round(v_gc_rev),
    'total_revenue_krw', round(v_sub_rev + v_gc_rev),
    'total_margin_krw', round(v_sub_rev + v_gc_rev - v_cost),
    'total_margin_pct', case when (v_sub_rev + v_gc_rev) > 0
                             then round((1 - v_cost / (v_sub_rev + v_gc_rev)) * 100) else null end);
end $$;

-- ── 9. 월 사용량 — 값을 가르는 장치는 여기다 ──────────────
-- ⚠️ ai_spend.calls 로 세면 안 된다. 그건 '턴'이 아니라 'API 호출 수'라,
--    도구를 부르는 턴 하나가 2~3으로 잡힌다. 사용자에게 청구서를 부풀려 보여주게 된다.
-- ⚠️ ai_window_usage 는 48시간 뒤 지워진다(폭주 방어용이라 그게 맞다).
--    그래서 지워지기 전에 월 단위로 굴려 담는다.
create table if not exists public.ai_month_usage (
  subject text not null,            -- 'u:<uuid>' | 'g:<device hash>'
  fn      text not null,
  month   date not null,            -- 한국 시간 기준 그 달의 1일
  calls   int  not null default 0,
  primary key (subject, fn, month)
);
create index if not exists ai_month_usage_month_idx on public.ai_month_usage (month);
alter table public.ai_month_usage enable row level security;   -- 정책 없음 = service_role 전용

-- ai_gate 를 건드리지 않고 굴린다. 세는 함수에 손대면 그게 곧 한도 사고다.
create or replace function public._ai_month_roll()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_delta int;
begin
  v_delta := new.calls - coalesce(old.calls, 0);
  if v_delta <= 0 then return new; end if;
  insert into ai_month_usage (subject, fn, month, calls)
  values (new.subject, new.fn,
          date_trunc('month', (new.bucket at time zone 'Asia/Seoul'))::date, v_delta)
  on conflict (subject, fn, month) do update
    set calls = ai_month_usage.calls + excluded.calls;
  return new;
end $$;

drop trigger if exists ai_window_month_roll on public.ai_window_usage;
create trigger ai_window_month_roll
  after insert or update on public.ai_window_usage
  for each row execute function public._ai_month_roll();

comment on table public.ai_month_usage is
  '월 대화량. 값을 가르는 장치다(5시간 창은 폭주 방어). ai_window_usage 가 48시간 뒤 지워지므로 트리거로 굴려 담는다.';

-- ── 10. 얼마나 남았나 — 화면이 이걸로 그린다 ──────────────
create or replace function public.companion_usage(p_uid uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_uid uuid := coalesce(p_uid, auth.uid());
  v_tier text; v_inc int; v_used int; v_gc int; v_label text;
begin
  if v_uid is null then return jsonb_build_object('ok', true, 'tier', 'guest'); end if;
  -- 남의 사용량은 관리자만 본다
  if p_uid is not null and p_uid <> auth.uid() and not _is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  v_tier := public.tier_of(v_uid);
  select (v -> v_tier ->> 'monthly_turns')::int, (v -> v_tier ->> 'label')
    into v_inc, v_label from app_settings where k = 'ai_tiers';

  select coalesce(sum(calls), 0)::int into v_used
    from ai_month_usage
   where subject = 'u:' || v_uid::text
     and fn = 'galla-friend'
     and month = date_trunc('month', (now() at time zone 'Asia/Seoul'))::date;

  -- 포함량을 넘겨도 막지 않는다 — 넘은 만큼 GC 로 이어진다.
  select gc into v_gc from gc_prices where item = 'chat_turn' and active;

  return jsonb_build_object(
    'ok', true, 'tier', v_tier, 'label', coalesce(v_label, v_tier),
    'included', coalesce(v_inc, 0), 'used', v_used,
    'remaining', greatest(coalesce(v_inc, 0) - v_used, 0),
    'over', greatest(v_used - coalesce(v_inc, 0), 0),
    -- gc_per_turn 이 null 이면 아직 종량 단가가 안 정해졌다는 뜻이다(화면은 그때 안내만).
    'gc_per_turn', v_gc,
    'resets_on', (date_trunc('month', (now() at time zone 'Asia/Seoul')) + interval '1 month')::date
  );
end $$;
grant execute on function public.companion_usage(uuid) to authenticated;

comment on function public.companion_usage(uuid) is
  '이번 달 대화 몇 턴 썼고 얼마 남았나. 포함량을 넘으면 막지 않고 over 로 알려 준다 — 넘은 만큼 GC.';

-- ── 11. 포함량을 넘겼을 때의 값 ───────────────────────────
-- ⚠️ 여기서 차감하지 않는다. 세는 쪽이 돈까지 빼면 재시도가 곧 이중과금이 된다.
--    값만 알려 주고 차감은 호출부(엣지 함수)가 한다.
create or replace function public.over_limit_price(p_fn text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_item text; v_gc int;
begin
  v_item := case when p_fn like 'galla-friend%' then 'chat_turn' else null end;
  if v_item is null then return jsonb_build_object('available', false); end if;
  select gc into v_gc from gc_prices where item = v_item and active;
  if v_gc is null then return jsonb_build_object('available', false, 'reason', 'no_price'); end if;
  return jsonb_build_object('available', true, 'item', v_item, 'gc', v_gc);
end $$;
grant execute on function public.over_limit_price(text) to authenticated;

-- 초과분 대화 단가 — 값은 사장님이 정한다. 정할 때까지 잠가 둔다(active=false).
-- 잠겨 있는 동안은 포함량을 넘겨도 과금되지 않고, 5시간 창만 남는다.
insert into public.gc_prices(item, gc, cost_krw, cost_basis, label, unit, min_units, max_units, active)
values ('chat_turn', 0, 1.46,
  '딥시크 청구서 대조 실측 — 턴당 ₩1.46(캐시히트 97% 반영). 월 포함량을 넘긴 대화에만 적용.',
  '대화 한 턴', 'turn', 1, 200, false)
on conflict (item) do update set
  cost_krw = excluded.cost_krw, cost_basis = excluded.cost_basis,
  unit = 'turn', max_units = 200;
