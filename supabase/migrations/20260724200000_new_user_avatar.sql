-- 🖼 소셜(구글 등) 가입자의 프로필 사진을 users.avatar_url로 복사.
-- 기존 handle_new_user는 avatar_url을 안 넣어서 소셜 유저가 전부 기본 갈라아이콘으로 보였음.
-- 구글/카카오는 raw_user_meta_data에 avatar_url 또는 picture로 사진 URL을 준다(https 절대URL).

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  bd date := null;
  agreed boolean := coalesce((m->>'terms_agreed')::boolean, false);
  mkt boolean := coalesce((m->>'marketing_opt_in')::boolean, false);
  av text := nullif(coalesce(m->>'avatar_url', m->>'picture'), '');
begin
  begin bd := nullif(m->>'birth_date','')::date; exception when others then bd := null; end;

  insert into public.users (id, nickname, phone, region, email, birth_date, gender, avatar_url)
  values (
    new.id,
    nullif(m->>'nickname', ''),
    nullif(m->>'phone', ''),
    nullif(m->>'region', ''),
    new.email,
    bd,
    nullif(m->>'gender', ''),
    av
  )
  on conflict (id) do update set
    nickname   = coalesce(excluded.nickname,   public.users.nickname),
    phone      = coalesce(excluded.phone,      public.users.phone),
    region     = coalesce(excluded.region,     public.users.region),
    email      = coalesce(excluded.email,       public.users.email),
    birth_date = coalesce(excluded.birth_date, public.users.birth_date),
    gender     = coalesce(excluded.gender,     public.users.gender),
    avatar_url = coalesce(public.users.avatar_url, excluded.avatar_url);  -- 이미 올린 사진 우선

  insert into public.user_profiles (
    user_id, nickname, phone, region, anonymous,
    birth_date, age_verified,
    terms_agreed_at, privacy_agreed_at,
    marketing_opt_in, marketing_agreed_at
  )
  values (
    new.id,
    nullif(m->>'nickname', ''),
    nullif(m->>'phone', ''),
    nullif(m->>'region', ''),
    coalesce((m->>'anonymous')::boolean, false),
    bd,
    coalesce((m->>'age_verified')::boolean, false),
    case when agreed then now() else null end,
    case when agreed then now() else null end,
    mkt,
    case when mkt then now() else null end
  )
  on conflict (user_id) do nothing;

  return new;
end;
$function$;
