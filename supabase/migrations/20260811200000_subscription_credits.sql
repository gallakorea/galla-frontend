-- =========================================================
-- 이용권 포함 크레딧 — "이중 과금" 해소, 단 손해는 구조로 막는다
--
-- 왜 '한도 내 무료'로 안 하나 (실측):
--   한도를 다 쓰면 우리가 무는 월 원가 / 정가
--     무료   ₩9,354  / ₩0
--     라이트 ₩25,458 / ₩2,900   (8.8배)
--     프렌드 ₩73,116 / ₩6,900   (10.6배)
--     프로   ₩197,040 / ₩14,900 (13.2배)
--   즉 이용권 한도는 원가 상한이 아니라 그냥 횟수 제한이고,
--   실제로 우리를 지키던 건 GC 과금이었다. 그걸 없애면 프로 한 명이 13배 적자다.
--
-- 대신: 이용권에 매달 GC를 얹어준다(정가의 100%).
--   유저 — "이용권 사니 GC가 매달 들어온다" → 이중으로 내는 느낌이 사라진다
--   우리 — 포함 GC량이 곧 원가 상한이다. 최악(마진 최저인 영상)으로 다 써도
--          포함 GC의 약 20%가 원가 → 프로 15,000 GC 기준 최대 ₩3,000.
--   횟수 한도(ai_tiers.windows)는 그대로 둔다 — 폭주 방어선으로 계속 필요하다.
--
-- ⚠️ 반드시 지갑을 분리한다.
--   포함 크레딧을 gc_balances.balance(=현금으로 충전한 GC)에 섞으면
--   환불 계산이 그걸 현금으로 돌려주게 된다. 구독 크레딧은 현금이 아니다.
--   → sub_gc 를 따로 둔다. 환불(gc_refund_request)은 balance 만 본다(이미 그렇다).
--
-- 정책: 이월 없음(갱신 시 초기화) · 해지해도 만료일까지는 사용 가능 · 만료와 함께 소멸.
-- =========================================================

alter table public.gc_balances
  add column if not exists sub_gc         integer     not null default 0 check (sub_gc >= 0),
  add column if not exists sub_gc_expires timestamptz;

comment on column public.gc_balances.sub_gc is
  '이용권 포함 크레딧. 현금이 아니므로 환불 대상이 아니다(gc_refund_request 는 balance 만 본다). 이월 없음 — 갱신 시 덮어쓰고 만료되면 소멸.';

-- 등급별 포함 GC (정가의 100%). 값은 여기서만 고친다.
insert into app_settings(k, v) values ('sub_credits', jsonb_build_object(
  'lite', 3000, 'friend', 7000, 'pro', 15000
)) on conflict (k) do update set v = excluded.v;

-- ---------------------------------------------------------
-- 만료 처리는 lazy 로 — 크론이 밀려도 만료된 크레딧이 쓰이면 안 된다
-- ---------------------------------------------------------
create or replace function public._gc_sub_live(p_user uuid)
returns integer language sql stable security definer set search_path to 'public' as $$
  select coalesce((select case when sub_gc_expires is null or sub_gc_expires <= now()
                               then 0 else sub_gc end
                     from gc_balances where user_id = p_user), 0)::int;
$$;

-- ---------------------------------------------------------
-- 소비 순서: 포함 크레딧 먼저 → 충전 GC
--   포함분은 어차피 소멸하니 먼저 쓰는 게 유저에게 유리하고,
--   환불 가능한 현금(balance)은 최대한 남는다.
--   ⚠️ 환불 홀드(held)는 balance 밖에 있으므로 여기서 따로 뺄 게 없다.
-- ---------------------------------------------------------
create or replace function public._gc_spend(p_user uuid, p_amt integer, p_reason text default 'spend')
returns double precision language plpgsql security definer set search_path to 'public' as $$
declare v_sub int; v_from_sub int; v_rest int; v_bal int;
begin
  if p_user is null or p_amt is null or p_amt <= 0 then return null; end if;
  insert into gc_balances(user_id) values (p_user) on conflict (user_id) do nothing;

  -- 만료분은 그 자리에서 청소(다음 조회부터 0)
  update gc_balances set sub_gc = 0, sub_gc_expires = null, updated_at = now()
   where user_id = p_user and sub_gc > 0
     and (sub_gc_expires is null or sub_gc_expires <= now());

  select coalesce(sub_gc,0), coalesce(balance,0) into v_sub, v_bal
    from gc_balances where user_id = p_user for update;

  v_from_sub := least(v_sub, p_amt);
  v_rest     := p_amt - v_from_sub;
  if v_rest > v_bal then return null; end if;          -- 합쳐도 모자라면 아무것도 건드리지 않는다

  update gc_balances
     set sub_gc = sub_gc - v_from_sub,
         balance = balance - v_rest,
         updated_at = now()
   where user_id = p_user
  returning balance into v_bal;

  if v_from_sub > 0 then
    insert into gc_ledger(user_id, delta, reason) values (p_user, -v_from_sub, p_reason || '#sub');
  end if;
  if v_rest > 0 then
    insert into gc_ledger(user_id, delta, reason) values (p_user, -v_rest, p_reason);
  end if;
  return v_bal;
end $$;

-- ---------------------------------------------------------
-- 지급 — 구독 시작·갱신 때 초기화(이월 없음)
-- ---------------------------------------------------------
create or replace function public._gc_sub_grant(p_user uuid, p_tier text, p_expires timestamptz)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_gc int;
begin
  select (v ->> p_tier)::int into v_gc from app_settings where k = 'sub_credits';
  v_gc := coalesce(v_gc, 0);
  if v_gc <= 0 then return 0; end if;

  insert into gc_balances(user_id) values (p_user) on conflict (user_id) do nothing;
  -- 이월 없음 — 남아 있던 포함분은 새 달치로 '덮어쓴다'(더하지 않는다)
  update gc_balances set sub_gc = v_gc, sub_gc_expires = p_expires, updated_at = now()
   where user_id = p_user;
  insert into gc_ledger(user_id, delta, reason) values (p_user, v_gc, 'gc:sub_credit:' || p_tier);
  return v_gc;
end $$;
revoke execute on function public._gc_sub_grant(uuid, text, timestamptz) from anon, authenticated, public;

-- 구독 시작·갱신 시 자동 지급
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

  -- 🎁 포함 크레딧 지급. 만료는 구독 만료와 같이 간다 —
  --    해지해도 만료일까지는 쓸 수 있고, 만료와 함께 소멸한다.
  v_gc := _gc_sub_grant(p_uid, p_tier, v_exp);

  return jsonb_build_object('ok', true, 'tier', p_tier, 'expires_at', v_exp, 'credit_gc', v_gc);
end $$;

-- ---------------------------------------------------------
-- 조회 — 화면이 두 지갑을 구분해 보여줄 수 있어야 한다
-- ---------------------------------------------------------
create or replace function public.gc_balance()
returns integer language plpgsql stable security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then return null; end if;
  -- 쓸 수 있는 총액(포함 크레딧 + 충전 GC). 만료분은 _gc_sub_live 가 걸러낸다.
  return coalesce((select balance from gc_balances where user_id = auth.uid()), 0)
       + _gc_sub_live(auth.uid());
end $$;

create or replace function public.gc_wallet()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_bal int; v_held int; v_sub int; v_exp timestamptz;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  select coalesce(balance,0), coalesce(held,0), sub_gc_expires
    into v_bal, v_held, v_exp from gc_balances where user_id = v_user;
  v_sub := _gc_sub_live(v_user);
  return jsonb_build_object('ok',true,
    'total',   coalesce(v_bal,0) + v_sub,
    'charged', coalesce(v_bal,0),          -- 현금으로 충전한 것 (환불 가능)
    'held',    coalesce(v_held,0),
    'sub',     v_sub,                       -- 이용권 포함 (환불 불가·이월 없음)
    'sub_expires', case when v_sub > 0 then v_exp end,
    'tier',    tier_of(v_user));
end $$;
grant execute on function public.gc_wallet() to authenticated;

-- 만료된 포함 크레딧 청소(표시용 — 소비는 이미 lazy 로 막힌다)
create or replace function public.expire_sub_credits() returns integer
language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  update gc_balances set sub_gc = 0, sub_gc_expires = null, updated_at = now()
   where sub_gc > 0 and (sub_gc_expires is null or sub_gc_expires <= now());
  get diagnostics n = row_count; return n;
end $$;
revoke execute on function public.expire_sub_credits() from anon, authenticated, public;
