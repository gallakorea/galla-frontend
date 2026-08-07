-- 🔎 이메일로 auth 유저 조회 — 소셜 로그인 find-or-create용(service_role 전용).
-- naver-auth가 listUsers() 전체 스캔으로 찾던 것을 대체: 유저가 늘면 페이지 밖 유저를 못 찾아
-- '이미 있는데 없다'고 판정 → 생성 충돌 → 로그인 실패(user_upsert)로 이어진다.
create or replace function public.auth_uid_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

revoke all on function public.auth_uid_by_email(text) from public, anon, authenticated;
