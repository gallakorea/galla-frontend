-- 🏦 레드팀 문제은행 (2026-08-08)
--
--  왜 만드나: 지금까지 찾은 결함 16종이 커밋 메시지에만 남아 있어서, 고친 게 다시 뚫려도 아무도 모른다.
--  실제로 '이름 조르기'는 프롬프트로 고쳤다가 재발했고, 7차 후처리는 실사용(스트리밍) 경로에
--  아예 안 걸린 채 "고쳤다"고 기록됐다. 검증이 1회성이면 회귀는 반드시 돌아온다.
--
--  구조: cases(문제) → runs(회차) → results(케이스별 판정). 새 결함을 찾으면 케이스로 등록하고,
--  이후 모든 회차가 그걸 영구히 검사한다. 목표는 fail 0.

create table if not exists public.redteam_cases (
  id          bigserial primary key,
  code        text not null unique,                 -- 안정 식별자(파일·커밋에서 참조)
  category    text not null,                        -- 안전 | 기억 | 관계 | 대화품질 | 환각 | 인프라
  title       text not null,
  severity    int  not null default 2,              -- 1 치명(안전·법적) 2 중대 3 개선
  script      jsonb not null,                       -- 보낼 유저 메시지 배열
  setup       jsonb not null default '{}'::jsonb,   -- {pre:[...], wait_sec:n, depth:n, msg_count:n, new_session:true}
  assertions  jsonb not null,                       -- 판정 규칙 배열(러너가 해석)
  stream      boolean not null default true,        -- 실사용자 경로(SSE)로 검사할지
  origin      text,                                 -- 몇 차에서 발견됐나
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.redteam_runs (
  id          bigserial primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  total       int default 0,
  passed      int default 0,
  failed      int default 0,
  note        text
);

create table if not exists public.redteam_results (
  id       bigserial primary key,
  run_id   bigint not null references public.redteam_runs(id) on delete cascade,
  case_id  bigint not null references public.redteam_cases(id) on delete cascade,
  passed   boolean not null,
  failures jsonb not null default '[]'::jsonb,      -- 어떤 assertion이 왜 깨졌나
  transcript jsonb not null default '[]'::jsonb,    -- 전사(사람이 읽고 판단해야 하는 것들 때문에 필수)
  created_at timestamptz not null default now(),
  unique (run_id, case_id)
);

create index if not exists idx_rt_results_run on public.redteam_results(run_id);
create index if not exists idx_rt_cases_active on public.redteam_cases(active) where active;

-- 러너는 service_role로만 접근한다(테스트 데이터라 일반 유저에게 열 이유가 없다).
alter table public.redteam_cases   enable row level security;
alter table public.redteam_runs    enable row level security;
alter table public.redteam_results enable row level security;
revoke all on public.redteam_cases, public.redteam_runs, public.redteam_results from anon, authenticated;

-- 📊 관제용 요약 — 최근 회차의 유형별 실패 현황
create or replace function public.admin_redteam_summary(p_limit int default 5)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_runs jsonb; v_open jsonb;
begin
  if not _is_admin() then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;

  select jsonb_agg(x order by (x->>'id')::bigint desc) into v_runs from (
    select jsonb_build_object('id', r.id, 'at', r.started_at, 'total', r.total,
                              'passed', r.passed, 'failed', r.failed, 'note', r.note) x
      from redteam_runs r order by r.id desc limit greatest(p_limit, 1)
  ) q;

  -- 가장 최근 회차에서 깨진 케이스
  select jsonb_agg(jsonb_build_object(
           'code', c.code, 'category', c.category, 'title', c.title,
           'severity', c.severity, 'failures', res.failures)
         order by c.severity, c.code)
    into v_open
    from redteam_results res
    join redteam_cases c on c.id = res.case_id
   where res.run_id = (select max(id) from redteam_runs) and not res.passed;

  return jsonb_build_object('ok', true,
    'runs', coalesce(v_runs, '[]'::jsonb),
    'open_failures', coalesce(v_open, '[]'::jsonb));
end $$;
