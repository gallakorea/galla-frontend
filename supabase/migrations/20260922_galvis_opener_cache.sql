-- 🏝 아일랜드 자동 첫마디 공유 캐시(26.9.22) — 같은 콘텐츠를 여러 사람이 열어도 AI 는 30분에 한 번만.
create table if not exists public.galvis_opener_cache(
  key text primary key,
  reply text not null,
  actions jsonb not null default '[]'::jsonb,
  at timestamptz not null default now()
);
alter table public.galvis_opener_cache enable row level security;   -- 정책 없음 = 서비스 키만
revoke all on public.galvis_opener_cache from anon, authenticated;
