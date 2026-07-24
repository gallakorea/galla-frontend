-- 🚨 회귀 수정: 댓글/발제/광장댓글 insert가 전부 "permission denied for function _is_banned"로 실패.
-- 원인: comments/issues/plaza_comments의 RLS with-check 정책이 _is_banned(auth.uid())를 호출하는데,
--       이 정책은 insert하는 authenticated 롤 권한으로 평가된다. 그런데 _is_banned의 EXECUTE가
--       service_role/postgres에만 부여돼 있어(authenticated 누락) 정책 평가 자체가 42501로 거부됨.
-- 해결: authenticated(+anon)에 EXECUTE 부여. 함수는 SECURITY DEFINER라 소유자 권한으로 밴 여부만
--       확인하므로 안전. (밴 로직/데이터 노출 없음 — boolean만 반환)
grant execute on function public._is_banned(uuid) to authenticated, anon;
