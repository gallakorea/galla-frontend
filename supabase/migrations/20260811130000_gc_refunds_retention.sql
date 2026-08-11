-- =========================================================
-- 환불 기록 보존 — 계정 탈퇴해도 지워지지 않게
--
-- 20260811110000에서 gc_refunds.user_id 에 on delete cascade 를 걸었는데, 그러면
-- 탈퇴 시 환불 기록이 사라진다. 전자상거래법 §6은 대금 결제·재화 공급 기록을
-- 5년 보존하도록 요구한다 — 환불도 그 기록이다.
-- gc_charges 는 애초에 auth.users FK가 없어 탈퇴해도 남는다. 같은 규칙으로 맞춘다.
-- =========================================================
alter table public.gc_refunds drop constraint if exists gc_refunds_user_id_fkey;
alter table public.gc_refunds drop constraint if exists gc_refunds_processed_by_fkey;

comment on column public.gc_refunds.user_id is
  '신청자. auth.users FK를 일부러 걸지 않는다 — 탈퇴해도 결제·환불 기록은 5년 보존해야 한다(전자상거래법 §6).';

-- charge_id 의 cascade 도 같은 이유로 끊는다(충전 기록이 지워지면 환불 기록만 떠도는 것보다,
-- 둘 다 남는 편이 감사 추적에 맞다)
alter table public.gc_refunds drop constraint if exists gc_refunds_charge_id_fkey;
alter table public.gc_refunds
  add constraint gc_refunds_charge_id_fkey
  foreign key (charge_id) references public.gc_charges(id) on delete restrict;

-- 탈퇴 계정이 남긴 잔액 행은 의미가 없다(금액 기록은 gc_charges/gc_ledger에 있다)
delete from public.gc_balances b
 where not exists (select 1 from auth.users u where u.id = b.user_id);
