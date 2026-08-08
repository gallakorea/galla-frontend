-- 🩹 문제은행 실행 이력이 하나도 안 쌓이고 있었다 (2026-08-08)
--
--  원인: `redteam_runs`는 **예전 갈비스 레드팀 배터리가 쓰던 테이블**이 이미 있었다
--  (ran_at/personas/flags/health/...). 그래서 `create table if not exists`가 조용히 아무것도 안 했고,
--  러너의 insert가 매번 PGRST204로 실패 → run_id=null → 결과·전사가 단 한 줄도 저장되지 않았다.
--  판정은 stdout으로만 보였기 때문에 4회차 동안 눈치채지 못했다.
--  ⚠️ `create table if not exists`는 '이름만' 본다. 기존 테이블과 스키마가 달라도 알려주지 않는다.
--
--  해법: 이름을 분리한다(예전 배터리 테이블은 그대로 둔다).

create table if not exists public.redteam_bank_runs (
  id          bigserial primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  total       int default 0,
  passed      int default 0,
  failed      int default 0,
  note        text
);

-- results는 아직 0행이라 FK를 안전하게 갈아끼울 수 있다
alter table public.redteam_results drop constraint if exists redteam_results_run_id_fkey;
alter table public.redteam_results
  add constraint redteam_results_run_id_fkey
  foreign key (run_id) references public.redteam_bank_runs(id) on delete cascade;

alter table public.redteam_bank_runs enable row level security;
revoke all on public.redteam_bank_runs from anon, authenticated;

-- 관제 요약도 새 테이블을 보게
create or replace function public.admin_redteam_summary(p_limit int default 5)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_runs jsonb; v_open jsonb; v_flaky jsonb;
begin
  if not _is_admin() then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;

  select jsonb_agg(x order by (x->>'id')::bigint desc) into v_runs from (
    select jsonb_build_object('id', r.id, 'at', r.started_at, 'total', r.total,
                              'passed', r.passed, 'failed', r.failed, 'note', r.note) x
      from redteam_bank_runs r order by r.id desc limit greatest(p_limit, 1)
  ) q;

  select jsonb_agg(jsonb_build_object(
           'code', c.code, 'category', c.category, 'title', c.title,
           'severity', c.severity, 'failures', res.failures)
         order by c.severity, c.code)
    into v_open
    from redteam_results res
    join redteam_cases c on c.id = res.case_id
   where res.run_id = (select max(id) from redteam_bank_runs) and not res.passed;

  -- 🎯 흔들리는 케이스 — 매번 깨지는 건 진짜 결함, 가끔 깨지는 건 판정이 좁거나 확률적 축이다.
  select jsonb_agg(x order by (x->>'fail_pct')::numeric desc) into v_flaky from (
    select jsonb_build_object('code', c.code, 'severity', c.severity,
             'runs', count(*), 'fails', count(*) filter (where not r.passed),
             'fail_pct', round(100.0 * count(*) filter (where not r.passed) / count(*))) x
      from redteam_results r join redteam_cases c on c.id = r.case_id
     group by c.code, c.severity having count(*) filter (where not r.passed) > 0
  ) q;

  return jsonb_build_object('ok', true,
    'runs', coalesce(v_runs, '[]'::jsonb),
    'open_failures', coalesce(v_open, '[]'::jsonb),
    'flaky', coalesce(v_flaky, '[]'::jsonb));
end $$;
