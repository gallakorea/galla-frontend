-- 🎟 갈비스 단계별 이용권 — 게스트/무료/프렌드/프로 + 5시간 롤링 윈도우 (2026-08-08)
--
--  왜 롤링 윈도우인가: '하루 1회 자정 리셋'은 낮에 소진하면 밤까지 완전 정지 → 이탈.
--  5시간 창은 하루에 여러 번 회복되고, "몇 시 몇 분에 다시 열려요"를 정확히 말해줄 수 있다(클로드식).
--
--  ⚠️ 금액·한도는 전부 app_settings.ai_tiers 로 뺀다. 코드 배포 없이 사장님이 조정.
--  ⚠️ GC(현금)는 여기서 다루지 않는다. 구독은 PG/IAP 성공 시 start_subscription 으로만 부여.

-- ─────────────────────────────────────────────────────────────
-- 1) 구독
-- ─────────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  tier        text not null check (tier in ('friend', 'pro')),
  started_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  source      text not null default 'admin',      -- web_pg | ios_iap | android_iap | admin
  auto_renew  boolean not null default false,
  ext_id      text,                               -- PG 주문번호 / IAP original_transaction_id
  updated_at  timestamptz not null default now()
);
create index if not exists subscriptions_expires_idx on public.subscriptions (expires_at);

alter table public.subscriptions enable row level security;
drop policy if exists subs_self_read on public.subscriptions;
create policy subs_self_read on public.subscriptions for select using (auth.uid() = user_id);
-- 쓰기는 SECURITY DEFINER RPC로만(정책 없음 = 클라이언트 직접 쓰기 차단)

-- ─────────────────────────────────────────────────────────────
-- 2) 롤링 윈도우 사용량 — 10분 버킷
--    이벤트를 한 줄씩 쌓으면 헤비유저 하루 수천 행. 10분으로 뭉치면 창당 최대 30행이고
--    "언제 열리나"도 (가장 오래된 버킷 + 창길이)로 분 단위까지 정확히 나온다.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.ai_window_usage (
  subject text not null,            -- 'u:<uuid>' | 'g:<device hash>' | 'gi:<ip hash>'
  fn      text not null,
  bucket  timestamptz not null,     -- 10분 정렬
  calls   int not null default 0,
  primary key (subject, fn, bucket)
);
create index if not exists ai_window_bucket_idx on public.ai_window_usage (bucket);
alter table public.ai_window_usage enable row level security;   -- 정책 없음 = service_role 전용

-- ─────────────────────────────────────────────────────────────
-- 3) 등급 설정 기본값
-- ─────────────────────────────────────────────────────────────
insert into public.app_settings (k, v) values ('ai_tiers', jsonb_build_object(
  'guest', jsonb_build_object(
    'label', '게스트', 'price', 0,
    'windows', jsonb_build_object(
      'galla-friend',    jsonb_build_object('n', 5,   'hours', 24),
      -- IP는 남용 스크립트만 잡는 넓은 그물. 통신사 NAT·카페는 수백 명이 한 IP를 공유한다.
      'galla-friend-ip', jsonb_build_object('n', 250, 'hours', 24)
    ),
    'features', jsonb_build_array()
  ),
  'free', jsonb_build_object(
    'label', '무료', 'price', 0,
    'windows', jsonb_build_object(
      'galla-friend',       jsonb_build_object('n', 40, 'hours', 5),
      'generate-sticker',   jsonb_build_object('n', 3,  'hours', 24),
      'generate-thumbnail', jsonb_build_object('n', 2,  'hours', 24),
      'generate-video',     jsonb_build_object('n', 0,  'hours', 24)
    ),
    'features', jsonb_build_array('memory')
  ),
  'friend', jsonb_build_object(
    'label', '프렌드', 'price', 4900,
    'windows', jsonb_build_object(
      'galla-friend',       jsonb_build_object('n', 150, 'hours', 5),
      'generate-sticker',   jsonb_build_object('n', 20,  'hours', 24),
      'generate-thumbnail', jsonb_build_object('n', 15,  'hours', 24),
      'generate-video',     jsonb_build_object('n', 1,   'hours', 24)
    ),
    'features', jsonb_build_array('memory', 'voice', 'craft_thumbnail', 'craft_titles', 'no_ads')
  ),
  'pro', jsonb_build_object(
    'label', '프로', 'price', 12900,
    'windows', jsonb_build_object(
      'galla-friend',       jsonb_build_object('n', 600, 'hours', 5),
      'generate-sticker',   jsonb_build_object('n', 60,  'hours', 24),
      'generate-thumbnail', jsonb_build_object('n', 60,  'hours', 24),
      'generate-video',     jsonb_build_object('n', 5,   'hours', 24)
    ),
    'features', jsonb_build_array('memory', 'voice', 'craft_thumbnail', 'craft_titles', 'craft_video', 'priority', 'no_ads')
  )
)) on conflict (k) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 4) 등급 조회
-- ─────────────────────────────────────────────────────────────
create or replace function public.tier_of(p_uid uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select case when p_uid is null then 'guest' else
    coalesce((select s.tier from subscriptions s
               where s.user_id = p_uid and s.expires_at > now() limit 1), 'free') end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5) 게이트 — 창 안에서 몇 번 썼는지 세고, 넘으면 '언제 열리는지'까지 돌려준다
-- ─────────────────────────────────────────────────────────────
create or replace function public.ai_gate(p_fn text, p_subject text, p_n int default 1)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid; v_tier text; v_cfg jsonb; v_win jsonb;
  v_limit int; v_hours numeric; v_from timestamptz; v_used int; v_bucket timestamptz;
  v_oldest timestamptz;
begin
  if p_subject is null or p_subject = '' or p_fn is null or p_fn = '' then
    return jsonb_build_object('ok', true, 'tier', 'free');   -- 식별 불가 시 통과(글로벌 캡이 최후 방어)
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
    return jsonb_build_object('ok', true, 'tier', v_tier);   -- 이 등급에 규칙이 없는 기능 = 제한 없음
  end if;

  v_limit := coalesce((v_win ->> 'n')::int, 0);
  v_hours := coalesce((v_win ->> 'hours')::numeric, 5);
  if v_limit <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'tier_locked', 'tier', v_tier, 'limit', 0);
  end if;

  v_from   := now() - make_interval(secs => (v_hours * 3600)::int);
  v_bucket := date_trunc('hour', now()) + make_interval(mins => (extract(minute from now())::int / 10) * 10);

  insert into ai_window_usage (subject, fn, bucket, calls) values (p_subject, p_fn, v_bucket, 0)
  on conflict (subject, fn, bucket) do nothing;

  -- 창 전체를 잠가야 동시 연타에 천장이 뚫리지 않는다
  perform 1 from ai_window_usage
   where subject = p_subject and fn = p_fn and bucket >= v_from for update;

  select coalesce(sum(calls), 0), min(bucket) filter (where calls > 0)
    into v_used, v_oldest
    from ai_window_usage where subject = p_subject and fn = p_fn and bucket >= v_from;

  if v_used + p_n > v_limit then
    return jsonb_build_object(
      'ok', false, 'reason', 'rate_limit', 'tier', v_tier,
      'limit', v_limit, 'used', v_used, 'hours', v_hours,
      'resets_at', coalesce(v_oldest, v_bucket) + make_interval(secs => (v_hours * 3600)::int)
    );
  end if;

  update ai_window_usage set calls = calls + p_n
   where subject = p_subject and fn = p_fn and bucket = v_bucket;

  return jsonb_build_object('ok', true, 'tier', v_tier, 'limit', v_limit,
                            'used', v_used + p_n, 'remaining', v_limit - v_used - p_n, 'hours', v_hours);
end $$;

-- ─────────────────────────────────────────────────────────────
-- 6) 내 이용권 상태 — 프론트가 잔여량·업그레이드 배너를 그리는 근거
-- ─────────────────────────────────────────────────────────────
create or replace function public.my_entitlement(p_fn text default 'galla-friend')
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid(); v_tier text; v_cfg jsonb; v_win jsonb;
  v_limit int; v_hours numeric; v_used int; v_oldest timestamptz; v_sub subscriptions;
begin
  if v_uid is null then return jsonb_build_object('tier', 'guest'); end if;
  v_tier := public.tier_of(v_uid);
  select v into v_cfg from app_settings where k = 'ai_tiers';
  select * into v_sub from subscriptions where user_id = v_uid and expires_at > now();

  v_win   := coalesce(v_cfg -> v_tier -> 'windows' -> p_fn, v_cfg -> v_tier -> 'windows' -> '_default');
  v_limit := coalesce((v_win ->> 'n')::int, -1);
  v_hours := coalesce((v_win ->> 'hours')::numeric, 5);

  select coalesce(sum(calls), 0), min(bucket) filter (where calls > 0) into v_used, v_oldest
    from ai_window_usage
   where subject = 'u:' || v_uid::text and fn = p_fn
     and bucket >= now() - make_interval(secs => (v_hours * 3600)::int);

  return jsonb_build_object(
    'tier', v_tier,
    'label', coalesce(v_cfg -> v_tier ->> 'label', v_tier),
    'features', coalesce(v_cfg -> v_tier -> 'features', '[]'::jsonb),
    'fn', p_fn, 'limit', v_limit, 'used', coalesce(v_used, 0),
    'remaining', case when v_limit < 0 then -1 else greatest(v_limit - coalesce(v_used, 0), 0) end,
    'hours', v_hours,
    'resets_at', case when v_oldest is null then null
                      else v_oldest + make_interval(secs => (v_hours * 3600)::int) end,
    'expires_at', v_sub.expires_at,
    'auto_renew', coalesce(v_sub.auto_renew, false),
    'plans', coalesce(v_cfg, '{}'::jsonb)
  );
end $$;

-- ─────────────────────────────────────────────────────────────
-- 7) 구독 부여 — 결제 성공(PG/IAP) 또는 관리자만. 클라이언트가 직접 못 부른다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.start_subscription(
  p_uid uuid, p_tier text, p_days int default 30,
  p_source text default 'admin', p_ext_id text default null, p_auto_renew boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_base timestamptz; v_exp timestamptz;
begin
  -- service_role 전용(엣지 함수의 PG/IAP 검증 통과분만 도달). SECURITY DEFINER 안에서 current_user는
  -- 소유자로 평가되므로 권한 판정은 반드시 auth.role() 로 한다.
  if coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_tier not in ('friend', 'pro') then
    return jsonb_build_object('ok', false, 'reason', 'bad_tier');
  end if;

  -- 남은 기간이 있으면 이어붙인다(중복결제·업그레이드 시 손해 방지)
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

  return jsonb_build_object('ok', true, 'tier', p_tier, 'expires_at', v_exp);
end $$;

revoke all on function public.start_subscription(uuid, text, int, text, text, boolean) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 8) 오래된 버킷 청소 — 가장 긴 창(24h)의 두 배만 남긴다
-- ─────────────────────────────────────────────────────────────
create or replace function public.ai_window_sweep()
returns int language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  delete from ai_window_usage where bucket < now() - interval '48 hours';
  get diagnostics n = row_count; return n;
end $$;

select cron.schedule('ai_window_sweep_job', '17 4 * * *', $$select public.ai_window_sweep()$$)
where not exists (select 1 from cron.job where jobname = 'ai_window_sweep_job');
