-- 🔓 이슈 수정/삭제 실패 "permission denied for function _is_admin" 수정.
-- issues(및 다수 테이블)의 admin RLS 정책이 is_admin()→_is_admin()을 호출하는데
-- _is_admin()에 authenticated/anon EXECUTE 권한이 없어, RLS 평가 중 함수 호출이 42501로 터짐.
-- (소유자 정책이 통과해도 permissive OR 평가에서 _is_admin이 호출되면 예외 발생 → 전체 실패)
-- _is_banned 때와 동일한 누락. SECURITY DEFINER 불리언 체크라 grant 안전.

grant execute on function public._is_admin() to authenticated, anon;
