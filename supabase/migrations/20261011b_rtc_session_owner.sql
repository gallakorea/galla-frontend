-- 2026-10-11 보안 감사: rtc-sfu 가 로그인만 확인하고 /sessions/<아무 id>/… 를 앱 시크릿으로 중계했다.
-- 세션 id 는 방 채널에 방송되므로 같은 방 누구나 남의 세션 트랙을 닫거나 바꿀 수 있었다(발언자 음소거·방해).
-- 세션을 만든 유저를 기록하고, 이후 경로는 주인만 쓰게 한다. 엣지(service_role)만 읽고 쓴다.
create table if not exists public.rtc_sessions (
  session_id text primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.rtc_sessions enable row level security;
revoke all on public.rtc_sessions from public, anon, authenticated;
grant all on public.rtc_sessions to service_role;
create index if not exists rtc_sessions_created_idx on public.rtc_sessions(created_at);
