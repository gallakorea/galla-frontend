-- 😜 아재개그 DB — 갈비스가 대화 중 가끔 던지는 유머 코퍼스 (Management API로 적용됨, 이 파일은 기록용)
create table if not exists public.dad_jokes (
  id bigint generated always as identity primary key,
  q text not null,
  a text not null,
  tags text[] default '{}',
  safe boolean default true,
  used_count int default 0,
  source text,
  created_at timestamptz default now(),
  norm text generated always as (lower(regexp_replace(q||'|'||a,'[^가-힣a-z0-9]','','g'))) stored
);
create unique index if not exists dad_jokes_norm_uidx on public.dad_jokes(norm);  -- 중복 방지
alter table public.dad_jokes enable row level security;
revoke all on public.dad_jokes from anon, authenticated;  -- 서비스롤(galla-friend)만 접근
-- 시드(157개): 온라인 아재개그 모음 스크랩 → 중복제거·정제 후 insert ... on conflict (norm) do nothing.
