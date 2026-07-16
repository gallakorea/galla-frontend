-- 초대 코드 → 초대자 공개 닉네임 (초대 링크 OG 카드 개인화용)
-- 공개 닉네임만 반환. user_profiles 자체는 anon 차단 유지(PII 보호).
create or replace function public.ref_owner(p_code text)
returns text language sql stable security definer set search_path to 'public' as $$
  select u.nickname
    from user_profiles p join users u on u.id = p.user_id
   where p.ref_code = upper(btrim(p_code))
   limit 1;
$$;
revoke all on function public.ref_owner(text) from public;
grant execute on function public.ref_owner(text) to anon, authenticated;
