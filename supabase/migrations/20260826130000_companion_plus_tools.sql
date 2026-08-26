-- =========================================================
-- 컴패니언+ — 앱 조작(도구) 200턴 포함
--
-- 실측이 이 상품을 정당화했다 (2026-08-26, 사장님 계정으로 3턴 측정)
--   순수 대화   1.0 콜/턴 · 턴당 ₩0.27
--   앱 조작     4.0 콜/턴 · 턴당 ₩6.13      ← 23배
--   콜 수만 4배가 아니라 콜 하나가 더 비싸다(₩1.76 vs ₩0.85) —
--   도구 정의와 도구 결과가 컨텍스트에 실리기 때문이다.
--
-- 그래서 포함량을 '턴'으로만 세면 안 된다. 같은 300턴이라도
--   전부 대화면 원가 ₩81, 전부 조작이면 ₩1,839 — 22배가 벌어진다.
--   조작을 많이 쓰는 몇 명이 싼 단을 사면 그대로 적자다.
--   → 대화 한도와 조작 한도를 따로 센다.
--
-- 값 (컴패니언+ ₩3,400)
--   대화 900턴 × ₩0.85(로그인 실측)        = ₩765
--   조작 200턴 × ₩6.13                     = ₩1,226
--   합계 원가 ₩1,991 / 실수령×85% = ₩2,803  → 여유 29%
--   ⚠️ 컴패니언 매일(₩1,900)에 ₩1,000만 얹으면 적자다.
--      조작 200턴 원가가 ₩1,226이라 웃돈이 최소 ₩1,487 필요하다.
--
-- ⚠️ 회귀 방지 — 지금은 모든 유저가 도구를 무제한으로 쓴다.
--    도구를 컴패니언+ 전용으로 잠그면 오늘 되던 게 내일 안 된다.
--    무료·컴패니언에도 소량을 남긴다(맛은 보되, 많이 쓰면 사게).
-- =========================================================

-- ── 1. 조작 한도를 등급마다 붙인다 ────────────────────────
-- tool_turns = 월 조작 턴수. windows['galla-friend:tool'] 은 순간 폭주 방어(5시간).
--   ⚠️ windows 에 항목이 없으면 ai_gate 가 '규칙 없음 = 무제한'으로 통과시키고
--      ai_window_usage 에 쓰지도 않는다 → 월 집계가 아예 안 쌓인다. 반드시 넣는다.
update app_settings set v = (
  select jsonb_object_agg(t.k,
    case
      when t.k = 'guest' then jsonb_set(jsonb_set(t.val, '{tool_turns}', '0'::jsonb),
             '{windows,galla-friend:tool}', jsonb_build_object('n', 0, 'hours', 5))
      else jsonb_set(
             jsonb_set(t.val, '{tool_turns}',
               case t.k when 'free' then '20' when 'companion_sometimes' then '20'
                        when 'companion_daily' then '20' when 'companion_always' then '30'
                        else '0' end::jsonb),
             '{windows,galla-friend:tool}', jsonb_build_object('n', 20, 'hours', 5))
    end)
  from jsonb_each(v) t(k, val)
) where k = 'ai_tiers';

-- ── 2. 컴패니언+ 추가 ─────────────────────────────────────
update app_settings set v = v || jsonb_build_object('companion_plus', jsonb_build_object(
  'label', '컴패니언+',
  'price', 3400,
  'monthly_turns', 900,
  'tool_turns', 200,
  'cost_basis', '대화 900×₩0.85 + 조작 200×₩6.13 = ₩1,991 (2026-08-26 실측)',
  'windows', jsonb_build_object(
     'galla-friend',      jsonb_build_object('n', 200, 'hours', 5),
     'galla-friend:tool', jsonb_build_object('n', 60,  'hours', 5)),
  'features', jsonb_build_array('memory','voice','no_ads','app_control')
)) where k = 'ai_tiers' and not (v ? 'companion_plus');

update app_settings set v = v || jsonb_build_object('companion_plus', 0) where k = 'sub_credits';

alter table public.subscriptions drop constraint if exists subscriptions_tier_check;
alter table public.subscriptions add constraint subscriptions_tier_check
  check (tier in ('companion_sometimes','companion_daily','companion_always','companion_plus'));

create or replace function public._tier_order()
returns text[] language sql immutable as $$
  select array['guest','free','companion_sometimes','companion_daily','companion_always','companion_plus'];
$$;

-- 모델 맵 — 안 넣으면 컴패니언+ 구독자가 말없이 저가 모델로 떨어진다(오류가 안 난다).
update app_settings set v = jsonb_set(
  jsonb_set(v, '{models,chat}',  (v -> 'models' -> 'chat')
    || jsonb_build_object('companion_plus', v -> 'models' -> 'chat' -> 'companion_daily')),
  '{models,heavy}', (v -> 'models' -> 'heavy')
    || jsonb_build_object('companion_plus', v -> 'models' -> 'heavy' -> 'companion_daily'))
 where k = 'ai_margin' and (v -> 'models' -> 'chat' -> 'companion_plus') is null;

-- ── 3. 조작이 몇 번 남았나 ────────────────────────────────
-- ⚠️ 읽기만 한다. 세는 함수가 돈이나 한도를 건드리면 재시도가 곧 이중차감이 된다.
-- ⚠️ 한도를 모르면 넉넉히 준다(fail open) — 계측 장애로 기능이 죽는 게 더 나쁘다.
create or replace function public.friend_tool_left(p_uid uuid default null)
returns integer language plpgsql stable security definer set search_path to 'public' as $$
declare v_uid uuid := coalesce(p_uid, auth.uid()); v_tier text; v_lim int; v_used int;
begin
  if v_uid is null then return 0; end if;
  v_tier := public.tier_of(v_uid);
  select (v -> v_tier ->> 'tool_turns')::int into v_lim from app_settings where k = 'ai_tiers';
  if v_lim is null then return 999; end if;      -- 설정 누락 = 막지 않는다
  select coalesce(sum(calls), 0)::int into v_used
    from ai_month_usage
   where subject = 'u:' || v_uid::text
     and fn = 'galla-friend:tool'
     and month = date_trunc('month', (now() at time zone 'Asia/Seoul'))::date;
  return greatest(v_lim - v_used, 0);
end $$;
grant execute on function public.friend_tool_left(uuid) to authenticated, service_role;

comment on function public.friend_tool_left(uuid) is
  '이번 달 앱 조작(도구) 턴이 몇 번 남았나. 조작 턴은 대화 턴의 23배 비싸서 따로 센다. 읽기 전용 — 차감하지 않는다.';

-- companion_usage 에 조작 현황을 같이 실어 준다(화면이 두 줄을 그린다)
create or replace function public.companion_usage(p_uid uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_uid uuid := coalesce(p_uid, auth.uid());
  v_tier text; v_inc int; v_used int; v_gc int; v_label text; v_tlim int; v_tused int;
begin
  if v_uid is null then return jsonb_build_object('ok', true, 'tier', 'guest'); end if;
  if p_uid is not null and p_uid <> auth.uid() and not _is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  v_tier := public.tier_of(v_uid);
  select (v -> v_tier ->> 'monthly_turns')::int, (v -> v_tier ->> 'label'), (v -> v_tier ->> 'tool_turns')::int
    into v_inc, v_label, v_tlim from app_settings where k = 'ai_tiers';

  select coalesce(sum(calls) filter (where fn = 'galla-friend'), 0)::int,
         coalesce(sum(calls) filter (where fn = 'galla-friend:tool'), 0)::int
    into v_used, v_tused
    from ai_month_usage
   where subject = 'u:' || v_uid::text
     and month = date_trunc('month', (now() at time zone 'Asia/Seoul'))::date;

  select gc into v_gc from gc_prices where item = 'chat_turn' and active;

  return jsonb_build_object(
    'ok', true, 'tier', v_tier, 'label', coalesce(v_label, v_tier),
    'included', coalesce(v_inc, 0), 'used', v_used,
    'remaining', greatest(coalesce(v_inc, 0) - v_used, 0),
    'over', greatest(v_used - coalesce(v_inc, 0), 0),
    'tool_included', coalesce(v_tlim, 0), 'tool_used', v_tused,
    'tool_remaining', greatest(coalesce(v_tlim, 0) - v_tused, 0),
    'gc_per_turn', v_gc,
    'resets_on', (date_trunc('month', (now() at time zone 'Asia/Seoul')) + interval '1 month')::date
  );
end $$;
grant execute on function public.companion_usage(uuid) to authenticated;

-- ── 가드 ─────────────────────────────────────────────────
do $$
declare v_share numeric; r record;
begin
  select (v ->> 'ai_share')::numeric into v_share from app_settings where k = 'ai_margin';

  -- 조작 한도가 있는데 5시간 창이 없으면 집계가 아예 안 쌓인다(ai_gate 가 무기록 통과)
  for r in select t.k as tier, t.val from app_settings a, lateral jsonb_each(a.v) t(k,val) where a.k='ai_tiers'
  loop
    if (r.val -> 'tool_turns') is null then raise exception '% 에 tool_turns 가 없다', r.tier; end if;
    if not ((r.val -> 'windows') ? 'galla-friend:tool') then
      raise exception '% 에 조작 5시간 창이 없다 — 월 집계가 안 쌓인다', r.tier;
    end if;
  end loop;

  -- 컴패니언+ 요금이 대화+조작 원가를 덮는가 (대화 ₩0.85 · 조작 ₩6.13 실측)
  select (v->'companion_plus'->>'price')::int as price,
         (v->'companion_plus'->>'monthly_turns')::int as turns,
         (v->'companion_plus'->>'tool_turns')::int as tools
    into r from app_settings where k='ai_tiers';
  if r.price * 0.97 * v_share < r.turns * 0.85 + r.tools * 6.13 then
    raise exception '컴패니언+ 요금이 원가를 못 덮는다 (요금 %, 대화 %턴, 조작 %턴)', r.price, r.turns, r.tools;
  end if;

  if (select (v->'companion_plus'->'features') from app_settings where k='ai_tiers')
     @> '["app_control"]'::jsonb is not true then
    raise exception '컴패니언+ 에 app_control 이 없다';
  end if;
end $$;
