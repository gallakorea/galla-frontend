-- 🏳️ 예측 깃발 진영 — 그 예측 주제에 맞는 말풍선 대사 창고
-- (26.9.20 사장님: 「말풍선 예시 다양하게, 기왕이면 주제에 해당하는 대화들이 오갈 수 있는 시스템」)
-- 이슈 줄다리기의 issue_tug_lines 와 같은 구조. 엣지 함수 crowd-lines 가 마켓마다 한 번 만들어 넣는다.
create table if not exists public.market_crowd_lines (
  market_id  bigint primary key references public.markets(id) on delete cascade,
  lines      jsonb  not null,
  model      text,
  created_at timestamptz not null default now()
);

alter table public.market_crowd_lines enable row level security;

-- 읽기는 누구나(화면이 그대로 쓴다). 쓰기는 서비스 롤(엣지 함수)만.
drop policy if exists mcl_read on public.market_crowd_lines;
create policy mcl_read on public.market_crowd_lines for select using (true);

grant select on public.market_crowd_lines to anon, authenticated;

comment on table public.market_crowd_lines is
  '예측 깃발 진영 말풍선(주제 맞춤). lines = {call[],top[],mid[],low[],defect_leave[],defect_stay[],defect_welcome[],duo[[a,b]],by_label{라벨:[...]}}';
