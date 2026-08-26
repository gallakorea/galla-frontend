-- =========================================================
-- 종량 과금 (pay-as-you-go) — 건당에서 양당으로
--
-- 지금까지: gc_prices 는 "1건에 얼마"였다. 생성 영상 3초든 30초든 1000 GC.
--           우리 원가는 초에 비례하는데 값은 안 비례하니, 짧게 쓰면 손해고
--           길게 쓰면 우리가 손해다. 둘 다 나쁘다.
--
-- 이제부터: 값이 붙는 자리를 셋으로 나눈다.
--   · 건당(unit is null)   — 우리 하드웨어로 도는 것. 릴스 렌더 1편.
--                            실측: 첫 제작 ₩13.5 / 재렌더 ₩0.9 / 승인 후 편집 ₩0.
--                            원가가 첫 1회에 몰려 있어 '건'이 맞는 단위다.
--   · 양당(unit='sec'|'img'|'turn') — 남의 API로 도는 것. 초·장·턴에 비례한다.
--
-- ⚠️ 애플 규정: 순수 후불 종량제는 앱스토어에서 못 한다.
--    소모성 IAP로 GC를 먼저 사고, 그 GC를 실계량으로 깎는 '선불 + 종량 차감'이
--    유일하게 가능한 형태다. 화면에는 잔량과 줄어드는 양만 — 가격·충전 유도 금지.
--
-- ⚠️ 값을 모르면 팔지 않는다.
--    gc_prices 에 행이 없으면 과금 함수가 실패하도록 이미 돼 있다(no_price).
--    아래에서 새로 넣는 종량 항목은 실원가를 재기 전까지 active=false 로 둔다.
-- =========================================================

-- ── 1. 가격표에 '단위'를 붙인다 ───────────────────────────
alter table public.gc_prices add column if not exists unit      text;   -- null = 건당
alter table public.gc_prices add column if not exists min_units integer not null default 1;
alter table public.gc_prices add column if not exists max_units integer;  -- 사고 방지 상한

comment on column public.gc_prices.unit is
  'null = 건당(gc 가 1건 값). ''sec''/''img''/''turn'' = 양당(gc 가 단위 1개 값).';
comment on column public.gc_prices.max_units is
  '한 요청에 청구 가능한 최대 단위. 버그로 3600초가 넘어와 지갑을 비우는 사고를 막는다.';

-- ── 2. 실측으로 갱신 ──────────────────────────────────────
-- 릴스: 자체 워커로 옮긴 뒤 실측 ₩13.5(첫 제작, TTS가 73%). 옛 Shotstack 추정 ₩200 은 죽었다.
-- ⚠️ gc 값은 사장님이 정한다. 여기 0 · active=false 로 넣는 건 '원가 근거만 먼저 적어두기'다.
--    값을 임의로 채워 넣으면 그게 그대로 가격이 되어 버린다 — 값을 모르면 팔지 않는다.
insert into public.gc_prices(item, gc, cost_krw, cost_basis, label, unit, max_units, active) values
  ('reel', 0, 13.50,
   '자체 워커 실측 — 첫 제작 ₩13.5(TTS 73%) · 재렌더 ₩0.9 · 승인 후 편집 ₩0. 렌더는 우리 하드웨어라 원가 0. 값 미정.',
   '릴스 1편', null, 1, false)
on conflict (item) do update set
  cost_krw = excluded.cost_krw, cost_basis = excluded.cost_basis, unit = null, max_units = 1;

-- 종량 항목 — 실원가를 재기 전까지 잠가 둔다(active=false → no_price 로 실패).
insert into public.gc_prices(item, gc, cost_krw, cost_basis, label, unit, min_units, max_units, active) values
  ('gen_video_sec', 0, null,
   '생성 영상 초당. 공급자 실단가·대기시간 미측정 — 재기 전까지 잠금.',
   '영상 생성 1초', 'sec', 1, 30, false),
  ('gen_image', 0, null,
   '생성 이미지 장당. CF FLUX 는 기존 인프라라 사실상 0이지만 폴백 경로가 비싸다 — 경로별 실측 후 개방.',
   '이미지 생성 1장', 'img', 1, 12, false)
on conflict (item) do nothing;

-- 대본·제목은 0 GC 인데 원가가 나간다(₩1.64/턴). 지금은 의도된 무료지만
-- 새는 자리라는 걸 표에 적어 둔다 — 다음 사람이 "왜 0이지?" 하고 헤매지 않도록.
update public.gc_prices
   set cost_basis = cost_basis || ' — ⚠️ 0 GC 정책적 무료. 원가는 실제로 나간다.'
 where item in ('script','titles') and gc = 0
   and cost_basis not like '%정책적 무료%';

-- ── 3. 견적 — 누르기 전에 얼마인지 알려준다 ────────────────
-- 지금은 눌러야 값을 안다. 종량제에서 그건 못 쓴다.
create or replace function public.ai_creation_quote(p_kind text, p_units integer default 1)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_user uuid := auth.uid();
  v_p record; v_n int; v_price int; v_bal int;
begin
  select gc, unit, min_units, max_units, label into v_p
    from gc_prices where item = p_kind and active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_price', 'item', p_kind);
  end if;

  v_n := greatest(coalesce(v_p.min_units, 1), coalesce(p_units, 1));
  if v_p.max_units is not null then v_n := least(v_n, v_p.max_units); end if;
  v_price := v_p.gc * v_n;

  v_bal := coalesce((select balance from gc_balances where user_id = v_user), 0);

  return jsonb_build_object(
    'ok', true, 'item', p_kind, 'label', v_p.label,
    'unit', v_p.unit, 'units', v_n, 'gc_per_unit', v_p.gc,
    'cost', v_price, 'currency', 'GC',
    'balance', v_bal, 'enough', (v_user is not null and v_bal >= v_price),
    'clamped', (v_n <> greatest(1, coalesce(p_units, 1)))
  );
end $$;

revoke execute on function public.ai_creation_quote(text, integer) from anon;
grant  execute on function public.ai_creation_quote(text, integer) to authenticated;

comment on function public.ai_creation_quote(text, integer) is
  '누르기 전 견적. 차감하지 않는다. 종량 항목은 units 를 초·장·턴으로 넘긴다.';

-- ── 4. 하루 상한 — 제품 제한이 아니라 사고 브레이크 ────────
-- 루프에 빠진 클라이언트가 잔액을 통째로 태우는 걸 막는 용도.
-- 값은 app_settings 에서 사장님이 조정한다.
insert into public.app_settings(k, v)
values ('ai_creation_caps', jsonb_build_object('daily_gc', 30000))
on conflict (k) do nothing;

create or replace function public._gc_spent_today(p_user uuid)
returns integer language sql stable security definer set search_path to 'public' as $$
  select coalesce(-sum(delta), 0)::int
    from gc_ledger
   where user_id = p_user
     and delta < 0
     and reason like 'ai_creation:%'
     and created_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
$$;
revoke execute on function public._gc_spent_today(uuid) from anon, authenticated, public;

-- ── 5. 과금 — 단위 clamp + 하루 상한 + 쓴 양 기록 ──────────
-- 곱셈(v_unit * n)은 이미 있었다. 없던 건 상한과 '몇 단위를 청구했는지'다.
-- 정산하려면 청구 당시의 단위 수를 알아야 한다.
alter table public.ai_creation_locks add column if not exists units integer;

create or replace function public.ai_creation_charge(
  p_kind text, p_n integer default 1, p_key text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_user uuid := auth.uid();
  v_p record; v_n int; v_price int; v_bal double precision;
  v_fp text; v_prev int; v_cap int; v_spent int;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;

  select gc, unit, min_units, max_units into v_p
    from gc_prices where item = p_kind and active;
  if not found then return jsonb_build_object('ok',false,'reason','no_price','item',p_kind); end if;

  -- 단위 clamp — 넘어온 값을 그대로 믿지 않는다
  v_n := greatest(coalesce(v_p.min_units,1), coalesce(p_n,1));
  if v_p.max_units is not null then v_n := least(v_n, v_p.max_units); end if;
  v_price := v_p.gc * v_n;

  if v_price <= 0 then return jsonb_build_object('ok',true,'charged',0,'units',v_n); end if;

  -- 하루 상한 (0 이하 = 무제한)
  v_cap := coalesce((select (v->>'daily_gc')::int from app_settings where k = 'ai_creation_caps'), 0);
  if v_cap > 0 then
    v_spent := _gc_spent_today(v_user);
    if v_spent + v_price > v_cap then
      return jsonb_build_object('ok',false,'reason','daily_cap','cap',v_cap,
        'spent_today',v_spent,'cost',v_price);
    end if;
  end if;

  -- 🔁 멱등 — 같은 지문이 유효기간 안에 다시 오면 과금하지 않는다.
  v_fp := nullif(btrim(coalesce(p_key,'')),'');
  if v_fp is not null then
    delete from ai_creation_locks
     where user_id = v_user and kind = p_kind and fingerprint = v_fp
       and created_at < now() - _ai_lock_ttl();

    insert into ai_creation_locks(user_id, kind, fingerprint, charged, units)
    values (v_user, p_kind, v_fp, 0, v_n)
    on conflict (user_id, kind, fingerprint) do nothing;

    if not found then
      select charged into v_prev from ai_creation_locks
       where user_id = v_user and kind = p_kind and fingerprint = v_fp;
      return jsonb_build_object('ok',true,'charged',0,'duplicate',true,
        'already_charged', coalesce(v_prev,0), 'currency','GC',
        'balance', coalesce((select balance from gc_balances where user_id = v_user),0));
    end if;
  end if;

  v_bal := _gc_spend(v_user, v_price, 'ai_creation:' || p_kind);
  if v_bal is null then
    if v_fp is not null then
      delete from ai_creation_locks where user_id = v_user and kind = p_kind and fingerprint = v_fp;
    end if;
    return jsonb_build_object('ok',false,'reason','insufficient','currency','GC','cost',v_price,
      'balance', coalesce((select balance from gc_balances where user_id = v_user),0));
  end if;

  if v_fp is not null then
    update ai_creation_locks set charged = v_price, units = v_n
     where user_id = v_user and kind = p_kind and fingerprint = v_fp;
  end if;

  return jsonb_build_object('ok',true,'charged',v_price,'units',v_n,
    'unit',v_p.unit,'currency','GC','balance',v_bal);
end $$;

grant execute on function public.ai_creation_charge(text, integer, text) to authenticated;

-- ── 6. 정산 — 덜 썼으면 차액을 돌려준다 ────────────────────
-- 종량제의 핵심. 30초로 견적 잡고 12초만 썼으면 18초치는 남의 돈이다.
--
-- ⚠️ 절대 클라이언트에 열지 않는다.
--    유저가 직접 부를 수 있으면 "1초만 썼다"고 신고해 환불을 뽑아낸다.
--    실제 소모량을 아는 건 워커/엣지 함수뿐이므로 service_role 전용이다.
create or replace function public.ai_creation_settle(
  p_user uuid, p_kind text, p_key text, p_actual_units integer)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_p record; v_lock record; v_n int; v_should int; v_diff int;
begin
  if p_user is null or nullif(btrim(coalesce(p_key,'')),'') is null then
    return jsonb_build_object('ok',false,'reason','bad_args');
  end if;

  select charged, units into v_lock from ai_creation_locks
   where user_id = p_user and kind = p_kind and fingerprint = btrim(p_key);
  if not found then return jsonb_build_object('ok',false,'reason','no_charge'); end if;

  select gc, min_units, max_units into v_p from gc_prices where item = p_kind;
  if not found then return jsonb_build_object('ok',false,'reason','no_price'); end if;

  v_n := greatest(coalesce(v_p.min_units,1), coalesce(p_actual_units,1));
  v_n := least(v_n, coalesce(v_lock.units, v_n));          -- 청구한 것보다 많이 정산하지 않는다
  v_should := v_p.gc * v_n;
  v_diff := v_lock.charged - v_should;

  if v_diff <= 0 then
    return jsonb_build_object('ok',true,'refunded',0,'charged',v_lock.charged);
  end if;

  -- 자물쇠는 남긴다(p_key 를 넘기지 않는다) — 정산은 재시도 허용이 아니다
  perform ai_creation_refund(p_user, v_diff);   -- 자물쇠는 남긴다: 정산은 재시도 허용이 아니다
  update ai_creation_locks set charged = v_should, units = v_n
   where user_id = p_user and kind = p_kind and fingerprint = btrim(p_key);

  return jsonb_build_object('ok',true,'refunded',v_diff,'charged',v_should,'units',v_n);
end $$;

revoke execute on function public.ai_creation_settle(uuid, text, text, integer)
  from anon, authenticated, public;

comment on function public.ai_creation_settle(uuid, text, text, integer) is
  '선차감액과 실제 소모량의 차액을 환불. service_role 전용 — 클라이언트가 부르면 소모량을 속여 환불을 뽑는다.';
