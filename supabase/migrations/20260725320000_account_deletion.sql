-- 계정 삭제 (애플 5.1.1(v) / 구글 정책 필수) 준비
--
-- 방식: 콘텐츠 연쇄삭제 대신 '개인정보·로그인만 삭제 + 작성물은 익명 유지'.
--   · public.users 행은 익명 툼스톤으로 남긴다(nickname='탈퇴한 회원', PII 전부 null).
--     → comments/issues/supports 등 5개 NO ACTION FK가 계속 유효 = 남의 댓글이 딸려 삭제되지 않음.
--   · auth.users 레코드를 삭제해 이메일·전화·로그인 수단을 없앤다(다시 로그인 불가).
--   · user_profiles(실명·전화·인구통계 PII)는 행째 삭제.
--
-- ⚠️ auth.users를 삭제하려면 public.users → auth.users FK(NO ACTION)가 막는다.
--    익명 툼스톤을 남기는 설계이므로 이 FK를 제거한다(가입 트리거가 id를 맞춰 넣는 동작은 그대로).

alter table public.users drop constraint if exists users_id_fkey;

alter table public.users add column if not exists deleted_at timestamptz;

-- 탈퇴 처리 RPC — 엣지 함수(service_role)가 auth 삭제 직전에 호출.
-- PII를 지우고 익명 툼스톤으로 만든다. 본인만 자기 계정에 대해 실행 가능.
create or replace function anonymize_account(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 호출 경로 보호: service_role(엣지 함수)이거나 본인일 때만
  if not (coalesce(auth.role(),'') = 'service_role' or auth.uid() = p_uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.users set
    nickname   = '탈퇴한회원',
    bio        = null,
    phone      = null,
    email      = null,
    avatar_url = null,
    region     = null,
    birth_year = null,
    birth_date = null,
    gender     = null,
    deleted_at = now()
  where id = p_uid;

  delete from public.user_profiles where user_id = p_uid;
end $$;

revoke all on function anonymize_account(uuid) from anon, authenticated, public;
grant execute on function anonymize_account(uuid) to service_role;
