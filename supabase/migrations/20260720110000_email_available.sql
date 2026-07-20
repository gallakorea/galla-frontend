-- 가입 위저드 이메일 스텝용 중복 확인 — 마지막 제출에서야 '이미 가입됨'을
-- 알게 되는 이탈 포인트 제거. (닉네임의 nickname_available과 같은 규약)
-- 주의: 이메일 존재 여부가 노출되는 API(열거 가능)지만, signUp 에러 메시지도
-- 동일 정보를 노출하므로 추가 리스크는 없다. anon 실행 허용(가입은 비로그인).
create or replace function public.email_available(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare v text := lower(btrim(coalesce(p_email,'')));
begin
  if v = '' or v !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return jsonb_build_object('ok', false, 'reason', 'format');
  end if;
  if exists (select 1 from auth.users where lower(email) = v) then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.email_available(text) from public;
grant execute on function public.email_available(text) to anon, authenticated;
