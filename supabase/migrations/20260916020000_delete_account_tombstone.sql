-- 계정 삭제가 「댓글을 쓴 적 있는 사람」에게 항상 실패하던 것(26.9.16 실측 23503).
-- auth.users 삭제 → users_id_auth_fkey(CASCADE) 로 탈퇴 툼스톤(public.users)까지 지워지는데,
-- comments·issues·issues_draft·supports·withdrawals 가 그 행을 NO ACTION 으로 붙잡아 삭제가 막혔다.
-- 설계는 「콘텐츠는 남기고 개인정보만 지운다」 = 툼스톤 유지. 그러니 CASCADE 연결을 끊는다.
alter table public.users drop constraint if exists users_id_auth_fkey;
comment on column public.users.id is
  '가입 시 auth.users.id 와 같은 값. 탈퇴(anonymize_account) 후에는 로그인 계정이 사라져도 이 행은 툼스톤으로 남는다 — 그래서 auth.users FK 를 두지 않는다(26.9.16).';
