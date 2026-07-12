-- 회원가입 RLS 오류 수정: 프로필 생성을 전부 서버측 트리거로 이관
-- 원인: 이메일 인증이 켜져 있어 auth.signUp 직후 세션이 없음 → 클라이언트의
--       users/user_profiles INSERT가 RLS(auth.uid()=id)에 막히고, 트리거가 만든
--       users(id) 행과 중복까지 발생.
-- 해결: handle_new_user 트리거(SECURITY DEFINER)가 raw_user_meta_data로부터
--       두 테이블을 모두 upsert. 클라이언트는 signUp options.data로 값만 전달.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.users (id, nickname, phone, region, email)
  values (
    new.id,
    nullif(m->>'nickname', ''),
    nullif(m->>'phone', ''),
    nullif(m->>'region', ''),
    new.email
  )
  on conflict (id) do update set
    nickname = coalesce(excluded.nickname, public.users.nickname),
    phone    = coalesce(excluded.phone,    public.users.phone),
    region   = coalesce(excluded.region,   public.users.region),
    email    = coalesce(excluded.email,     public.users.email);

  insert into public.user_profiles (user_id, nickname, phone, region, anonymous)
  values (
    new.id,
    nullif(m->>'nickname', ''),
    nullif(m->>'phone', ''),
    nullif(m->>'region', ''),
    coalesce((m->>'anonymous')::boolean, false)
  )
  on conflict (user_id) do nothing;

  return new;
end;
$function$;
