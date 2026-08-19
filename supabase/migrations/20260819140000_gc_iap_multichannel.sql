-- 결제 3채널(웹 PG / iOS IAP / 안드로이드) 안전장치 (2026-08-19)
--
-- 배경: 앱스토어 심사 후 웹결제·안드로이드까지 붙일 계획. 그 전에 구멍 두 개를 막는다.
--
-- 구멍 ① 같은 영수증으로 GC 를 두 번 받을 수 있었다.
--   gc_charge_confirm 은 charge_id 단위로만 멱등이다(status='paid' 재확인).
--   그런데 같은 스토어 거래를 '서로 다른 charge 행'에 태우면 그 방어를 우회한다.
--   GP 경로(gp_purchases)에는 on conflict (store, transaction_id) 가 있었는데 GC 경로엔 없었다.
--
-- 구멍 ② IAP 배선이 아직 GP 를 향하고 있었다.
--   verify-iap → grant_gp_topup → point_balances.paid_balance.
--   GP 는 판매하지 않는다(2026-08-09 확정) — 예측 판돈이라 팔면 '돈으로 사서 결과에 걸고 딴다'가
--   되어 규제 대상이 된다. IAP 를 켜는 순간 폐지한 GP 가 팔릴 뻔했다.
--
-- ⚠️ 아래 DDL 은 Management API 로 이미 적용됐다. 기록·재현용이며 가드가 살아있는지 검사한다.

-- ① 스토어/PG 거래 유니크 — 이중지급의 최종 방어선.
--    NULL 끼리는 충돌하지 않으므로 결제 대기(pending) 행에는 영향이 없다.
create unique index if not exists gc_charges_tx_uk
  on public.gc_charges (pg_provider, pg_tx_id);

-- ② 스토어 인앱결제 → GC 지급(영수증 검증은 엣지 verify-iap 가 끝낸 뒤 service_role 로 호출)
create or replace function public.grant_gc_topup(
  p_user uuid, p_store text, p_txid text, p_product text, p_raw jsonb default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_ch text; v_gc int; v_krw int; v_id uuid; v_bal int;
begin
  if not ((select auth.role())='service_role' or _is_admin()) then
    return jsonb_build_object('ok',false,'reason','forbidden'); end if;

  v_ch := case lower(coalesce(p_store,''))
            when 'apple' then 'ios' when 'ios' then 'ios'
            when 'google' then 'android' when 'android' then 'android' else null end;
  if v_ch is null then return jsonb_build_object('ok',false,'reason','bad_store'); end if;
  if coalesce(btrim(p_txid),'') = '' then return jsonb_build_object('ok',false,'reason','no_txid'); end if;

  -- 금액은 절대 클라이언트를 믿지 않는다. 상품ID→GC 는 서버 카탈로그가 결정한다.
  select p.gc, p.store_krw into v_gc, v_krw
    from gc_products p where p.channel = v_ch and p.pkg = p_product and p.active;
  if v_gc is null then return jsonb_build_object('ok',false,'reason','no_product'); end if;

  if exists (select 1 from gc_payment_blocks where user_id = p_user) then
    return jsonb_build_object('ok',false,'reason','blocked'); end if;

  insert into gc_charges(user_id, pkg, krw, gc, status, channel, fee, pg_provider, pg_tx_id, paid_at)
  values (p_user, p_product, coalesce(v_krw, v_gc), v_gc, 'paid', v_ch,
          greatest(coalesce(v_krw, v_gc) - v_gc, 0), lower(p_store), p_txid, now())
  on conflict (pg_provider, pg_tx_id) do nothing
  returning id into v_id;
  if v_id is null then return jsonb_build_object('ok',true,'dup',true); end if;

  insert into gc_balances(user_id) values(p_user) on conflict (user_id) do nothing;
  update gc_balances set balance = balance + v_gc, updated_at = now()
    where user_id = p_user returning balance into v_bal;
  insert into gc_ledger(user_id, delta, reason, ref_id) values (p_user, v_gc, 'gc:iap', v_id);

  return jsonb_build_object('ok',true,'credited',v_gc,'balance',v_bal,'charge_id',v_id);
end $fn$;

revoke all on function public.grant_gc_topup(uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.grant_gc_topup(uuid,text,text,text,jsonb) to service_role;

-- ③ GP 인앱결제 경로 봉인 — charge_confirm(웹)과 동일 정책을 스토어 경로에도.
create or replace function public.grant_gp_topup(
  p_user uuid, p_store text, p_txid text, p_product text, p_raw jsonb default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
begin
  return jsonb_build_object('ok', false, 'reason', 'gp_sale_discontinued',
    'message', 'GP는 판매하지 않습니다. 인앱결제는 GC로만 지급됩니다.');
end $fn$;

-- 🔒 가드 검사 — 누가 되돌리면 마이그레이션이 실패한다.
do $chk$
begin
  if not exists (select 1 from pg_indexes where indexname='gc_charges_tx_uk') then
    raise exception '스토어 거래 유니크 인덱스가 사라졌다 — 영수증 재사용 이중지급이 열린다';
  end if;
  if position('gp_sale_discontinued' in (
       select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='grant_gp_topup')) = 0 then
    raise exception 'GP 인앱결제 봉인이 풀렸다 — GP는 판매하지 않는다';
  end if;
end $chk$;
