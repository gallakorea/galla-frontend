-- 🔒 출금 신청은 request_withdrawal() 로만 — withdrawals 테이블 직접 INSERT 차단 (2026-09-10 QA)
--
-- 결함: authenticated 가 withdrawals 에 **직접 INSERT** 할 수 있었다. INSERT 정책 두 개
--   ("User inserts withdrawal" · "Users create their own withdrawals")가 auth.uid() = user_id 만 봤다.
--   → request_withdrawal() 의 최소 20만원·출금 가능액 검사를 건너뛴 999,999,999원 pending 행이 들어갔다
--     (QA 계정 가장, 예외로 무조건 취소한 시험 — id=4 발급, 잔존 0).
--   admin_process_withdrawal() 은 승인 때 잔액을 다시 보지 않으므로 관리자 화면엔 진짜 신청처럼 뜬다.
--
-- request_withdrawal() 은 SECURITY DEFINER 이고 소유자(postgres)가 테이블 소유자와 같으며 FORCE RLS 가 꺼져 있어
-- 이 차단의 영향을 받지 않는다. admin_* 도 SECURITY DEFINER.
-- PERMISSIVE 정책은 OR 로 합쳐지므로 느슨한 정책을 지우는 것에 더해 RESTRICTIVE 로 한 겹 더 막는다.
-- 클라이언트 코드에 withdrawals 직접 쓰기 0곳(확인 후).

drop policy if exists "User inserts withdrawal" on public.withdrawals;
drop policy if exists "Users create their own withdrawals" on public.withdrawals;

drop policy if exists "withdrawals_no_direct_insert" on public.withdrawals;
create policy "withdrawals_no_direct_insert" on public.withdrawals
  as restrictive for insert to public with check (false);

-- 권한도 회수 — UPDATE·DELETE 는 정책이 false 로 막고 있었지만 권한까지 열려 있을 이유가 없다.
revoke insert, update, delete on public.withdrawals from anon, authenticated;
revoke select on public.withdrawals from anon;
