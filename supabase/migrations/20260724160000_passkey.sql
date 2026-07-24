-- 🔑 패스키(WebAuthn) 로그인 — 비번 없이 생체/기기 인증.
-- 카카오를 빼고 구글 + 패스키로 감(사장님 확정 2026-07-24).
-- 실검증/세션발급은 edge function `passkey`(service_role)가 담당 → 여기선 저장소만.

-- 등록된 패스키 자격증명(공개키). 유저 1인 여러 기기 가능.
create table if not exists public.webauthn_credentials (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,          -- base64url(rawId)
  public_key    text not null,                 -- base64url(COSE public key)
  counter       bigint not null default 0,
  transports    text[] default '{}',
  device_label  text,                          -- "iPhone", "Mac" 등 표시용
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index if not exists idx_webauthn_cred_user on public.webauthn_credentials(user_id);

-- 챌린지 임시 저장(등록/로그인 ceremony). handle로 조회, 짧은 TTL.
create table if not exists public.webauthn_challenges (
  handle     text primary key,                 -- 랜덤(프론트로 반환)
  challenge  text not null,                     -- base64url
  kind       text not null,                     -- 'register' | 'login'
  user_id    uuid,                              -- register 시 로그인 유저
  expires_at timestamptz not null default (now() + interval '5 minutes')
);

alter table public.webauthn_credentials enable row level security;
alter table public.webauthn_challenges  enable row level security;

-- 본인 패스키 목록만 조회/삭제(관리 UI용). insert/update는 edge(service_role)만.
drop policy if exists wac_sel_own on public.webauthn_credentials;
create policy wac_sel_own on public.webauthn_credentials
  for select to authenticated using (user_id = auth.uid());
drop policy if exists wac_del_own on public.webauthn_credentials;
create policy wac_del_own on public.webauthn_credentials
  for delete to authenticated using (user_id = auth.uid());
-- challenges: anon/authenticated 접근 전면 차단(정책 없음 = 기본 거부). service_role만 사용.

-- 만료 챌린지 청소용(크론/온디맨드)
create or replace function public.purge_webauthn_challenges()
returns void language sql security definer set search_path = public as $$
  delete from public.webauthn_challenges where expires_at < now();
$$;
