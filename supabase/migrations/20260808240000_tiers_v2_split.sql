-- 🎟 등급 재설계 v2 — 실측 원가 기반 3단계 + '수다/무거운작업' 모델 분리 (2026-08-08)
--
--  실측(8턴 실제 대화): LLM 호출당 입력 21,692토큰(캐시히트 88%)·출력 86, 유저 1턴 = 1.4호출.
--  → 원/턴: 딥시크 4.1 / GPT-4o-mini 3.6 / Haiku 9.4 / Sonnet5 28.3 / Opus5 47.2
--  → 소나타5로 모든 턴을 처리하면 ₩14,900 요금제도 월 132턴(IAP 96턴)밖에 못 산다. 상품이 안 된다.
--
--  결론(사장님 승인): **수다는 저가 모델로 넉넉하게, 무거운 작업만 고급 모델로.**
--    · chat  = 일반 대화 → deepseek-chat (전 등급)
--    · heavy = 창작 기획·대본·심층분석 → 등급별 고급 모델, 월 '크레딧' 건수로 제한
--  크레딧 건수는 보수적으로 시작하고, ai_spend 실측이 쌓이면 조정한다(전부 app_settings).

-- 유료 3단계로 확장 (기존 friend/pro만 허용하던 제약 해제)
alter table public.subscriptions drop constraint if exists subscriptions_tier_check;
alter table public.subscriptions add constraint subscriptions_tier_check
  check (tier in ('lite', 'friend', 'pro'));

update public.app_settings set v = jsonb_build_object(
  'guest', jsonb_build_object(
    'label', '게스트', 'price', 0,
    'windows', jsonb_build_object(
      'galla-friend',    jsonb_build_object('n', 5,   'hours', 24),
      'galla-friend-ip', jsonb_build_object('n', 250, 'hours', 24)
    ),
    'features', jsonb_build_array()
  ),
  'free', jsonb_build_object(
    'label', '무료', 'price', 0,
    'windows', jsonb_build_object(
      'galla-friend',       jsonb_build_object('n', 12, 'hours', 5),   -- ≈10회/일, 월 원가 ₩1,200 이내
      'generate-sticker',   jsonb_build_object('n', 2,  'hours', 24),
      'generate-thumbnail', jsonb_build_object('n', 1,  'hours', 24),
      'generate-video',     jsonb_build_object('n', 0,  'hours', 24),
      'galvis-heavy',       jsonb_build_object('n', 0,  'hours', 720)
    ),
    'features', jsonb_build_array('memory')
  ),
  'lite', jsonb_build_object(
    'label', '라이트', 'price', 2900,
    'windows', jsonb_build_object(
      'galla-friend',       jsonb_build_object('n', 40, 'hours', 5),   -- ≈270턴/월
      'generate-sticker',   jsonb_build_object('n', 8,  'hours', 24),
      'generate-thumbnail', jsonb_build_object('n', 3,  'hours', 24),
      'generate-video',     jsonb_build_object('n', 0,  'hours', 24),
      'galvis-heavy',       jsonb_build_object('n', 3,  'hours', 720)  -- 월 3건 맛보기
    ),
    'features', jsonb_build_array('memory', 'voice', 'no_ads')
  ),
  'friend', jsonb_build_object(
    'label', '프렌드', 'price', 6900,
    'windows', jsonb_build_object(
      'galla-friend',       jsonb_build_object('n', 100, 'hours', 5),  -- ≈650턴/월
      'generate-sticker',   jsonb_build_object('n', 25,  'hours', 24),
      'generate-thumbnail', jsonb_build_object('n', 15,  'hours', 24),
      'generate-video',     jsonb_build_object('n', 1,   'hours', 24),
      'galvis-heavy',       jsonb_build_object('n', 15,  'hours', 720)
    ),
    'features', jsonb_build_array('memory', 'voice', 'no_ads', 'craft_thumbnail', 'craft_titles', 'craft_script')
  ),
  'pro', jsonb_build_object(
    'label', '프로', 'price', 14900,
    'windows', jsonb_build_object(
      'galla-friend',       jsonb_build_object('n', 250, 'hours', 5),  -- ≈1,400턴/월(사실상 무제한 체감)
      'generate-sticker',   jsonb_build_object('n', 60,  'hours', 24),
      'generate-thumbnail', jsonb_build_object('n', 60,  'hours', 24),
      'generate-video',     jsonb_build_object('n', 5,   'hours', 24),
      'galvis-heavy',       jsonb_build_object('n', 40,  'hours', 720)
    ),
    'features', jsonb_build_array('memory', 'voice', 'no_ads', 'craft_thumbnail', 'craft_titles',
                                  'craft_script', 'craft_video', 'priority')
  )
) where k = 'ai_tiers';

-- 마진 정책 v2 — 작업 종류(chat/heavy)별로 모델을 따로 잡는다.
update public.app_settings set v = jsonb_build_object(
  'krw_per_usd', 1380,
  'net_rate', jsonb_build_object('web_pg', 0.97, 'ios_iap', 0.70, 'android_iap', 0.70, 'admin', 1.0),
  'ai_share', 0.40,                    -- 채팅이 곧 상품이므로 실수령의 40%까지 AI 원가로 허용
  'free_month_krw',  1200,
  'guest_month_krw', 60,
  'models', jsonb_build_object(
    -- chat: 전 등급 저가 모델. 예산 초과 시에도 같은 모델(끊지 않고 계속 쓰게 한다).
    'chat', jsonb_build_object(
      'guest',  jsonb_build_object('primary', 'deepseek-chat', 'fallback', 'deepseek-chat'),
      'free',   jsonb_build_object('primary', 'deepseek-chat', 'fallback', 'deepseek-chat'),
      'lite',   jsonb_build_object('primary', 'deepseek-chat', 'fallback', 'deepseek-chat'),
      'friend', jsonb_build_object('primary', 'deepseek-chat', 'fallback', 'deepseek-chat'),
      'pro',    jsonb_build_object('primary', 'deepseek-chat', 'fallback', 'deepseek-chat')
    ),
    -- heavy: 창작 기획·대본·심층분석. 여기에만 고급 모델을 쓴다.
    'heavy', jsonb_build_object(
      'guest',  jsonb_build_object('primary', 'deepseek-chat',    'fallback', 'deepseek-chat'),
      'free',   jsonb_build_object('primary', 'deepseek-chat',    'fallback', 'deepseek-chat'),
      'lite',   jsonb_build_object('primary', 'claude-haiku-4-5', 'fallback', 'deepseek-chat'),
      'friend', jsonb_build_object('primary', 'claude-haiku-4-5', 'fallback', 'deepseek-chat'),
      'pro',    jsonb_build_object('primary', 'claude-sonnet-5',  'fallback', 'claude-haiku-4-5')
    )
  )
) where k = 'ai_margin';

-- model_for: 작업 종류(kind) 인자를 받아 chat/heavy를 구분
-- (인자명이 p_fn → p_kind로 바뀌므로 replace가 아니라 drop 후 재생성해야 한다)
drop function if exists public.model_for(uuid, text);
create function public.model_for(p_uid uuid, p_kind text default 'chat')
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_tier text; v_m jsonb; v_cfg jsonb; v_sub subscriptions;
  v_price numeric; v_net numeric; v_budget_usd numeric; v_spent numeric;
  v_since date; v_krw numeric;
begin
  select v into v_cfg from app_settings where k = 'ai_margin';
  v_tier := case when p_uid is null then 'guest' else public.tier_of(p_uid) end;
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
    from ai_spend where user_id = p_uid and day >= v_since;

  return jsonb_build_object(
    'tier', v_tier, 'kind', coalesce(p_kind, 'chat'),
    'model', case when v_spent >= v_budget_usd then v_m ->> 'fallback' else v_m ->> 'primary' end,
    'downgraded', v_spent >= v_budget_usd,
    'spent_usd', round(v_spent, 4), 'budget_usd', round(v_budget_usd, 4), 'since', v_since
  );
end $$;

-- ─────────────────────────────────────────────────────────────
-- 기능별 단품 = GC(현금성) 결제.
--  ⚠️ GC는 크리에이터 후원·정산에도 쓰이는 '실제 돈'이다. AI 기능 판매분은 후원이 아니라
--     **플랫폼 매출**이므로 창작자 배분(75%) 대상이 아니다 — gc_donate와 반드시 분리한다.
-- ─────────────────────────────────────────────────────────────
insert into public.app_settings (k, v) values ('ai_alacarte_gc', jsonb_build_object(
  'thumbnail',    120,
  'titles',        40,
  'script',       200,
  'video',       1200,
  'sticker',       80,
  'galvis_heavy', 150,      -- 고급 모델 심층 작업 1건
  'chat_pack_50', 300       -- 대화 50턴 추가권
)) on conflict (k) do nothing;

create table if not exists public.ai_purchases (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  item       text not null,
  gc         int  not null check (gc >= 0),
  qty        int  not null default 1 check (qty > 0),
  created_at timestamptz not null default now()
);
create index if not exists ai_purchases_user_idx on public.ai_purchases (user_id, created_at desc);
alter table public.ai_purchases enable row level security;
drop policy if exists ai_purchases_self_read on public.ai_purchases;
create policy ai_purchases_self_read on public.ai_purchases for select using (auth.uid() = user_id);
