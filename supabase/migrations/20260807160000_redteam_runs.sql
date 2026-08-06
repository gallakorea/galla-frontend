-- 🤖 레드팀 자동화 — 주1회 크론이 합성 페르소나로 라이브 갈비스를 두드려 '고친 실패 시그니처'가
--   재출현하는지(퇴행) 코드로 채점, 추이를 축적. 학습 플라이휠 ⑤측정의 자동화.
create table if not exists public.redteam_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  personas int not null default 0,
  turns int not null default 0,          -- 총 스캔한 갈비스 응답 수
  flags int not null default 0,          -- 레드플래그 총합(낮을수록 건강)
  health int not null default 100,       -- 100 - 페널티(0~100)
  flag_breakdown jsonb not null default '{}'::jsonb,   -- {tool_leak:2, therapist:0, ...}
  detail jsonb not null default '[]'::jsonb            -- [{probe, flags:[{cat,turn,excerpt}]}]
);
create index if not exists redteam_runs_ran_idx on public.redteam_runs(ran_at desc);
alter table public.redteam_runs enable row level security;   -- 정책 없음 = service_role·관리자 RPC만

-- 관제 패널 — 최근 런 추이 + 최신 상세.
create or replace function public.admin_redteam_runs(p_limit int default 12)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not _is_admin() then return jsonb_build_object('error','forbidden'); end if;
  select jsonb_build_object(
    'runs', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'at', to_char(ran_at,'MM-DD HH24:MI'), 'health', health, 'flags', flags,
        'turns', turns, 'breakdown', flag_breakdown) order by ran_at desc), '[]'::jsonb)
      from (select * from redteam_runs order by ran_at desc limit greatest(1, least(p_limit, 40))) t),
    'latest_detail', (select detail from redteam_runs order by ran_at desc limit 1)
  ) into v;
  return v;
end $$;
revoke all on function public.admin_redteam_runs(int) from public, anon;
grant execute on function public.admin_redteam_runs(int) to authenticated;
