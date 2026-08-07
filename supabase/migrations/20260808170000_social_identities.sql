-- 🔗 소셜 신원 매핑 — provider의 고유 id를 안정 식별자로 (2026-08-08)
--  문제: 네이버가 이메일 권한 없이 오면 합성 이메일(naver_<id>@galla.social)로 계정을 만든다.
--        나중에 이메일 권한을 켜면 '진짜 이메일'로 조회 → 못 찾음 → **같은 사람이 새 계정으로 갈라짐**(1인 1계정 원칙 위반).
--  해결: (provider, provider_uid) → user_id 매핑을 따로 둔다. 이메일이 바뀌어도 사람은 그대로 찾는다.
create table if not exists public.social_identities (
  provider text not null,
  provider_uid text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (provider, provider_uid)
);
create index if not exists social_identities_user_idx on public.social_identities(user_id);
alter table public.social_identities enable row level security;
revoke all on public.social_identities from public, anon, authenticated;

-- 조회/연결을 한 번에 (service_role 전용 — 엣지 함수에서만 호출)
create or replace function public.social_identity_link(p_provider text, p_uid text, p_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into social_identities(provider, provider_uid, user_id)
  values (p_provider, p_uid, p_user)
  on conflict (provider, provider_uid) do update set user_id = excluded.user_id;
$$;

create or replace function public.social_identity_uid(p_provider text, p_uid text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id from social_identities where provider = p_provider and provider_uid = p_uid;
$$;

revoke all on function public.social_identity_link(text, text, uuid) from public, anon, authenticated;
revoke all on function public.social_identity_uid(text, text) from public, anon, authenticated;

-- 기존 네이버 합성계정 백필 — user_metadata에 남아 있는 provider_naver_id로 매핑 생성
insert into public.social_identities (provider, provider_uid, user_id)
select 'naver', u.raw_user_meta_data ->> 'provider_naver_id', u.id
from auth.users u
where coalesce(u.raw_user_meta_data ->> 'provider_naver_id', '') <> ''
on conflict (provider, provider_uid) do nothing;
