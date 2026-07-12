-- 출시 컴플라이언스: 가입 동의 이력 + 연령확인 + 본인인증 자리 마련
-- (개인정보보호법 제22조/제22조의2, 정보통신망법 제50조 대비)
-- · 동의 이력(약관/개인정보/마케팅)을 타임스탬프로 보존
-- · 만 14세 이상 확인 플래그 + 생년월일
-- · 실명/CI/DI/휴대폰 본인인증 컬럼은 추후 본인확인기관(PASS 등) 연동 자리

alter table public.users
  add column if not exists birth_date date;

alter table public.user_profiles
  add column if not exists birth_date          date,
  add column if not exists age_verified         boolean not null default false,
  add column if not exists terms_agreed_at      timestamptz,
  add column if not exists privacy_agreed_at    timestamptz,
  add column if not exists marketing_opt_in     boolean not null default false,
  add column if not exists marketing_agreed_at  timestamptz,
  -- 본인인증(추후 provider 연동) 자리
  add column if not exists real_name            text,
  add column if not exists ci                   text,   -- 연계정보(중복가입 확인용, 암호화 저장 권장)
  add column if not exists di                   text,   -- 중복가입확인정보
  add column if not exists phone_verified        boolean not null default false,
  add column if not exists identity_verified_at timestamptz;

comment on column public.user_profiles.ci is '본인확인기관 연계정보(CI). 정산/중복가입 확인용. 운영 시 암호화 저장 권장';
comment on column public.user_profiles.di is '본인확인기관 중복가입확인정보(DI)';

-- 가입 시 metadata(raw_user_meta_data)로 넘어온 동의/연령을 두 테이블에 기록
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

  insert into public.users (id, nickname, phone, region, email, birth_date)
  values (
    new.id,
    nullif(m->>'nickname', ''),
    nullif(m->>'phone', ''),
    nullif(m->>'region', ''),
    new.email,
    bd
  )
  on conflict (id) do update set
    nickname   = coalesce(excluded.nickname,   public.users.nickname),
    phone      = coalesce(excluded.phone,      public.users.phone),
    region     = coalesce(excluded.region,     public.users.region),
    email      = coalesce(excluded.email,       public.users.email),
    birth_date = coalesce(excluded.birth_date, public.users.birth_date);

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
