-- 가입 시 성별 수집(통계 필수) → handle_new_user가 users.gender 기록
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  bd date := null;
  agreed boolean := coalesce((m->>'terms_agreed')::boolean, false);
  mkt boolean := coalesce((m->>'marketing_opt_in')::boolean, false);
begin
  begin bd := nullif(m->>'birth_date','')::date; exception when others then bd := null; end;

  insert into public.users (id, nickname, phone, region, email, birth_date, gender)
  values (
    new.id,
    nullif(m->>'nickname', ''),
    nullif(m->>'phone', ''),
    nullif(m->>'region', ''),
    new.email,
    bd,
    nullif(m->>'gender', '')
  )
  on conflict (id) do update set
    nickname   = coalesce(excluded.nickname,   public.users.nickname),
    phone      = coalesce(excluded.phone,      public.users.phone),
    region     = coalesce(excluded.region,     public.users.region),
    email      = coalesce(excluded.email,       public.users.email),
    birth_date = coalesce(excluded.birth_date, public.users.birth_date),
    gender     = coalesce(excluded.gender,     public.users.gender);

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
