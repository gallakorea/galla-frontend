-- 🧠 클립 분석 캐시 — 같은 클립은 항상 같은 판정을 쓰도록(회차마다 라벨이 "식당 입구"↔"올라가는 계단"으로
-- 흔들려 계단 컷이 나왔다 안 나왔다 하던 문제). URL 기준 영구 캐시.
create table if not exists public.clip_analysis (
  url text primary key,
  analysis jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.clip_analysis enable row level security;
-- 서비스 롤(엣지)만 접근. 클라이언트는 볼 필요 없다.
