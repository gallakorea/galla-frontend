-- =========================================================
-- GP 판매 봉인 (정책 확정: "후원·AI 등 비용 쓰는 것 빼고는 모두 GP")
--
--   GP = 출석·미션·활동으로만 모으는 게임 재화. 팔지 않는다.
--   GC = 실제 원가가 나가는 것(AI 창작·갈비스 고급 모델·크리에이터 후원)에만 쓰는 충전 재화.
--
-- 봉인 시점 실측: point_balances.paid_balance 보유자 0명 / 총 0
--                gp_charges pending 3건(=3,000 GP), PG 미연동이라 지급된 적 없음.
-- 따라서 회수해야 할 지급분이 없다 — pending만 취소하고 실행 권한을 거둔다.
--
-- ⚠️ _charge_price / _charge_fee_rate 는 gc_charge_* 가 공유한다. 절대 건드리지 말 것.
-- =========================================================

-- 1) 미결제 GP 충전 요청 취소 (지급된 적 없으므로 잔액 조정 불필요)
update public.gp_charges
   set status = 'canceled'
 where status = 'pending';

-- 2) 레거시 GP 충전 RPC 실행 권한 회수 — 클라이언트에서 호출 불가
revoke execute on function public.charge_begin(text)                 from anon, authenticated;
revoke execute on function public.charge_confirm(uuid, text, text)   from anon, authenticated;
revoke execute on function public.charge_packages()                  from anon, authenticated;

-- 3) 재승인 방지: 새 역할·재배포에도 기본 PUBLIC 실행권이 붙지 않도록 PUBLIC 도 회수
revoke execute on function public.charge_begin(text)                 from public;
revoke execute on function public.charge_confirm(uuid, text, text)   from public;
revoke execute on function public.charge_packages()                  from public;

comment on function public.charge_begin(text) is
  '[봉인 2026-08-11] GP는 판매하지 않는다. anon/authenticated 실행권 회수됨. 되살리려면 통화 정책 재결정이 먼저.';
comment on function public.charge_confirm(uuid, text, text) is
  '[봉인 2026-08-11] GP 판매 중단으로 봉인. GC 충전은 gc_charge_confirm 사용.';
comment on function public.charge_packages() is
  '[봉인 2026-08-11] GP 판매 중단으로 봉인. 충전 패키지는 gc_charge_packages 사용.';
