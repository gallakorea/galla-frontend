-- ⏳ GC 유효기간 5년 — PG 심사 요건이자 채무 관리 장치.
--
-- 왜 넣는가: 포인트 충전은 PG 심사에서 '조건부 업종'이고, 통과 조건 중 하나가
-- **충전금 유효기간 설정**이다. 무기한 잔액은 PG 입장에서 미상환 채무가 무한히
-- 쌓이는 구조라 그 자체로 거절 사유가 된다(실제 NHN KCP 반려 사유의 축).
--
-- 왜 5년인가: 상법 제64조 상사채권 소멸시효가 5년이다. 그보다 짧게 잡으면
-- 이용자에게 불리한 약관으로 다툼의 여지가 생기고, 길게 잡으면 유효기간을
-- 설정한 의미가 없다. 업계 관행(게임사 캐시)도 5년이 표준이다.
--
-- ⚠️ 소멸은 이 마이그레이션이 하지 않는다. 컬럼과 조회구만 만든다 —
--    실제 소멸 처리는 사전 고지(30일 전) 절차가 갖춰진 뒤에 붙인다.
--    돈이 걸린 삭제를 고지 없이 자동화하지 않는다.

-- 충전 건마다 만료일을 박는다. 잔액이 아니라 '충전 건' 단위여야
-- 먼저 충전한 것부터 만료되는(FIFO) 계산이 가능하다.
alter table public.gc_charges
  add column if not exists expires_at timestamptz;

comment on column public.gc_charges.expires_at is
  'GC 유효기간 만료일(지급일 + 5년). 약관 제9조·/products 고지와 일치해야 한다.';

-- 이미 지급된 건에 소급 적용 — paid_at 기준 5년.
update public.gc_charges
   set expires_at = paid_at + interval '5 years'
 where status = 'paid' and paid_at is not null and expires_at is null;

-- 지급 시점에 만료일을 함께 박는다. gc_charge_confirm 이 유일한 지급 관문이므로
-- 여기 한 곳만 고치면 웹 PG·IAP 모든 경로가 덮인다.
create or replace function public.gc_charge_confirm(p_charge_id uuid, p_pg_provider text default null, p_pg_tx text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c gc_charges%rowtype; v_bal int;
begin
  if not ((select auth.role())='service_role' or _is_admin()) then
    return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  select * into c from gc_charges where id=p_charge_id;
  if c.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if c.status='paid' then return jsonb_build_object('ok',true,'already',true); end if;
  insert into gc_balances(user_id) values(c.user_id) on conflict (user_id) do nothing;
  update gc_balances set balance = balance + c.gc, updated_at=now() where user_id=c.user_id returning balance into v_bal;
  insert into gc_ledger(user_id, delta, reason, ref_id) values (c.user_id, c.gc, 'gc:charge', c.id);
  update gc_charges
     set status='paid', paid_at=now(), pg_provider=p_pg_provider, pg_tx_id=p_pg_tx,
         expires_at = now() + interval '5 years'      -- ⏳ 유효기간 5년
   where id=p_charge_id;
  return jsonb_build_object('ok',true,'credited',c.gc,'balance',v_bal);
end $$;

-- 이용자가 '내 GC가 언제까지인지' 확인할 수 있어야 고지가 성립한다.
-- 가장 먼저 만료되는 건과 그 금액을 돌려준다.
create or replace function public.gc_expiry_info()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_next timestamptz; v_gc int; v_total int;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select min(expires_at) into v_next
    from gc_charges where user_id=v_uid and status='paid' and expires_at is not null;
  select coalesce(sum(gc),0) into v_gc
    from gc_charges where user_id=v_uid and status='paid' and expires_at = v_next;
  select coalesce(balance,0) into v_total from gc_balances where user_id=v_uid;
  return jsonb_build_object('ok',true,'balance',v_total,'next_expires_at',v_next,'next_expiring_gc',v_gc);
end $$;

revoke all on function public.gc_expiry_info() from public, anon;
grant execute on function public.gc_expiry_info() to authenticated;
