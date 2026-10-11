-- 2026-10-11: 이슈 '바깥 반응' — 이슈 키워드로 네이버 카페·블로그에서 찾은 실제 외부 글(출처 표기) 캐시.
-- 초기 텅 빈 판을 '조작' 없이 채우는 방법(사장님 선택 4번). 쓰기는 엣지(service_role)만, 읽기는 누구나.
create table if not exists public.issue_outside (
  issue_id bigint primary key references public.issues(id) on delete cascade,
  query text,
  items jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);
alter table public.issue_outside enable row level security;
revoke all on public.issue_outside from public, anon, authenticated;
grant select on public.issue_outside to anon, authenticated;
grant all on public.issue_outside to service_role;
drop policy if exists issue_outside_read on public.issue_outside;
create policy issue_outside_read on public.issue_outside for select using (true);
