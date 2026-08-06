-- 🎨 창작 품질 파이프라인 지원 — 성공사례 팩(주간 갱신) + 품질 벤치 기록
-- 사장님 승인(2026-08-06): 후보3+심판 파이프라인의 연료(갈라 실성과 few-shot)와 계기판.

-- 1) 성공사례 팩: 최근 30일 참여(찬+반) 상위 이슈의 제목·진영라벨·카테고리를 app_settings에 저장.
--    LLM 없음(순수 SQL) = 비용 0. galla-friend가 초안 생성 프롬프트에 주입.
create or replace function public.refresh_creation_exemplars()
returns void
language sql
security definer
set search_path = public
as $$
  insert into app_settings (k, v, updated_at)
  select 'creation_exemplars',
         jsonb_build_object(
           'refreshed_at', now(),
           'items', coalesce((
             select jsonb_agg(jsonb_build_object(
               'title', i.title, 'a', i.faction_a, 'b', i.faction_b,
               'cat', i.category, 'part', i.pro_count + i.con_count))
             from (
               select title, faction_a, faction_b, category, pro_count, con_count
               from issues
               where status = 'normal'
                 and created_at > now() - interval '30 days'
                 and (pro_count + con_count) >= 2
               order by (pro_count + con_count) desc
               limit 8
             ) i
           ), '[]'::jsonb)
         ),
         now()
  on conflict (k) do update set v = excluded.v, updated_at = now();
$$;

revoke all on function public.refresh_creation_exemplars() from public, anon, authenticated;

-- 즉시 1회 실행(첫 팩 생성)
select public.refresh_creation_exemplars();

-- 주 1회 갱신(일요일 21:15 UTC = 월요일 아침 KST). 순수 SQL이라 vault/시크릿 불필요.
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'craft-exemplars';
exception when others then null;
end $$;
select cron.schedule('craft-exemplars', '15 21 * * 0', $$select public.refresh_creation_exemplars()$$);

-- 2) 품질 벤치 기록 — 주간 회귀(galvis-craftbench 엣지fn이 기록). 파이프라인 개악 감지용.
create table if not exists public.craft_bench_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  avg_score numeric,            -- 심판 루브릭 평균(0~10)
  baseline_score numeric,       -- 원샷 대비 기준점
  detail jsonb                  -- 주제별 점수·선정 초안
);
alter table public.craft_bench_runs enable row level security;
revoke all on public.craft_bench_runs from public, anon, authenticated;

create or replace function public.admin_craft_bench(p_limit int default 12)
returns setof public.craft_bench_runs
language sql
security definer
set search_path = public
as $$
  select * from craft_bench_runs
  where public._is_admin()
  order by ran_at desc
  limit greatest(1, least(p_limit, 50));
$$;
grant execute on function public.admin_craft_bench(int) to authenticated;
