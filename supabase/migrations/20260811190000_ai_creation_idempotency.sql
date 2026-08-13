-- =========================================================
-- AI 창작 과금 멱등 — 같은 요청이 두 번 들어와도 한 번만 청구한다
--
-- 문제: 썸네일은 galla-friend 가 액션만 내보내고, 실제 200 GC 과금은
--   프론트가 generate-thumbnail 을 부를 때 일어난다. 그 사이에 중복 경로가 있다:
--     ① galla-friend 가 한 턴에 gen_thumbnail 을 두 번 호출 → 액션 2개
--        → friend.js 의 forEach 가 2번 호출 → 400 GC
--     ② 진행 중 재요청·중복 탭
--     ③ 네트워크 재시도(응답을 못 받고 다시 보냄 — 이미지는 이미 생성돼 과금됨)
--   프론트만 고치면 앱 구버전·다른 클라이언트·재시도에서 또 뚫린다. 서버에서 막는다.
--
-- 판정 기준: 시간이 아니라 '같은 요청인가'.
--   시간창으로만 막으면 "다른 느낌으로 다시 그려줘"가 공짜가 되고(우리 원가만 나감),
--   반대로 그걸 허용하려 창을 줄이면 진짜 중복을 놓친다.
--   → 요청 지문(fingerprint: 프롬프트·비율·레퍼런스)이 같을 때만 중복으로 본다.
--     프롬프트가 다르면 정상 과금 — 악용 여지가 없다.
--
-- ⚠️ create or replace 로 인자를 추가하면 '교체'가 아니라 '오버로드'가 생긴다.
--    (전에 charge_confirm 에서 bigint 오버로드가 생겨 옛 경로가 살아있던 사고가 있었다)
--    그래서 기존 2-인자 함수를 명시적으로 drop 한 뒤 새로 만든다.
-- =========================================================

create table if not exists public.ai_creation_locks (
  user_id     uuid        not null,
  kind        text        not null,
  fingerprint text        not null,
  charged     integer     not null default 0,
  created_at  timestamptz not null default now(),
  primary key (user_id, kind, fingerprint)
);
create index if not exists ai_creation_locks_age on public.ai_creation_locks(created_at);

alter table public.ai_creation_locks enable row level security;
drop policy if exists ai_creation_locks_admin on public.ai_creation_locks;
create policy ai_creation_locks_admin on public.ai_creation_locks for select using (_is_admin());

comment on table public.ai_creation_locks is
  '동일 창작 요청 재청구 방지. (user, kind, fingerprint) 유니크 — 같은 프롬프트로 다시 오면 과금하지 않는다. TTL 경과분은 _gc_prune_locks 가 청소.';

-- 지문 유효기간. 이 시간이 지나면 같은 프롬프트라도 새 요청으로 본다
-- (유저가 한참 뒤 같은 썸네일을 또 원하는 건 정상적인 새 주문이다).
create or replace function public._ai_lock_ttl() returns interval
language sql immutable as $$ select interval '10 minutes' $$;

-- ---------------------------------------------------------
-- 기존 2-인자 함수 제거 후 재작성 (오버로드 방지)
-- ---------------------------------------------------------
drop function if exists public.ai_creation_charge(text, integer);

create or replace function public.ai_creation_charge(
  p_kind text, p_n integer default 1, p_key text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_user uuid := auth.uid();
  v_unit int; v_price int; v_bal double precision; v_fp text; v_prev int;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;

  select gc into v_unit from gc_prices where item = p_kind and active;
  if v_unit is null then return jsonb_build_object('ok',false,'reason','no_price','item',p_kind); end if;

  v_price := v_unit * greatest(1, coalesce(p_n,1));
  if v_price <= 0 then return jsonb_build_object('ok',true,'charged',0); end if;

  -- 🔁 멱등 — 같은 지문이 유효기간 안에 다시 오면 과금하지 않는다.
  --    지문을 안 보내는 옛 클라이언트는 그냥 통과(하위호환) — 중복 위험은 남지만 막지는 않는다.
  v_fp := nullif(btrim(coalesce(p_key,'')),'');
  if v_fp is not null then
    delete from ai_creation_locks
     where user_id = v_user and kind = p_kind and fingerprint = v_fp
       and created_at < now() - _ai_lock_ttl();

    insert into ai_creation_locks(user_id, kind, fingerprint, charged)
    values (v_user, p_kind, v_fp, 0)
    on conflict (user_id, kind, fingerprint) do nothing;

    if not found then
      -- 이미 있던 지문 = 같은 요청이 또 온 것. 이전에 얼마 냈는지 알려주고 끝낸다.
      select charged into v_prev from ai_creation_locks
       where user_id = v_user and kind = p_kind and fingerprint = v_fp;
      return jsonb_build_object('ok',true,'charged',0,'duplicate',true,
        'already_charged', coalesce(v_prev,0), 'currency','GC',
        'balance', coalesce((select balance from gc_balances where user_id = v_user),0));
    end if;
  end if;

  v_bal := _gc_spend(v_user, v_price, 'ai_creation:' || p_kind);
  if v_bal is null then
    -- 과금 실패면 자물쇠도 풀어준다 — 충전 후 같은 프롬프트로 다시 시도할 수 있어야 한다
    if v_fp is not null then
      delete from ai_creation_locks where user_id = v_user and kind = p_kind and fingerprint = v_fp;
    end if;
    return jsonb_build_object('ok',false,'reason','insufficient','currency','GC','cost',v_price,
      'balance', coalesce((select balance from gc_balances where user_id = v_user),0));
  end if;

  if v_fp is not null then
    update ai_creation_locks set charged = v_price
     where user_id = v_user and kind = p_kind and fingerprint = v_fp;
  end if;

  return jsonb_build_object('ok',true,'charged',v_price,'currency','GC','balance',v_bal);
end $$;

grant execute on function public.ai_creation_charge(text, integer, text) to authenticated;

-- ---------------------------------------------------------
-- 환불되면 자물쇠도 푼다 — 생성이 실패해 환불했는데 자물쇠가 남아 있으면
-- 유저가 같은 프롬프트로 재시도할 때 "이미 청구됨"으로 막혀 아무것도 못 받는다.
-- ---------------------------------------------------------
drop function if exists public.ai_creation_refund(uuid, integer);

create or replace function public.ai_creation_refund(p_user uuid, p_amount integer, p_key text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_amount is null or p_amount <= 0 then return; end if;
  -- ⚠️ GC=실화폐: update만(차감된 유저는 행이 반드시 있음) — upsert로 '무에서 GC 생성'되는 경로 봉쇄.
  update gc_balances set balance = balance + p_amount, updated_at = now() where user_id = p_user;
  if found then
    insert into gc_ledger(user_id,delta,reason) values (p_user,p_amount,'ai_creation:refund');
  end if;
  if nullif(btrim(coalesce(p_key,'')),'') is not null then
    delete from ai_creation_locks where user_id = p_user and fingerprint = p_key;
  end if;
end $$;

-- 오래된 자물쇠 청소 (크론이 없어도 charge 시 자기 지문은 스스로 지운다 — 이건 전체 청소용)
create or replace function public._gc_prune_locks() returns integer
language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  delete from ai_creation_locks where created_at < now() - interval '1 day';
  get diagnostics n = row_count; return n;
end $$;
revoke execute on function public._gc_prune_locks() from anon, authenticated, public;
