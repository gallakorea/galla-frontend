-- 📱 출금 전 휴대폰 확인 = 문자 인증번호(26.9.18 사장님: 네이버·카카오 동의는 복잡 → 문자로).
-- 발송·확인은 엣지 sms-verify 만(service role). 코드는 해시로만 저장.
create table if not exists public.phone_otps (
  id bigserial primary key,
  user_id uuid not null,
  phone text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.phone_otps enable row level security;   -- 정책 없음 = 클라 접근 불가
create index if not exists phone_otps_user_idx on public.phone_otps (user_id, created_at desc);
create index if not exists phone_otps_phone_idx on public.phone_otps (phone, created_at desc);
