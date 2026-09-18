-- 🧠 이슈별 줄다리기 말풍선(26.9.19 사장님: 「그 주제에 대해서 자동으로 나오게」). 엣지 tug-lines 가 딥시크로 한 번 만들어 저장.
create table if not exists public.issue_tug_lines (
  issue_id bigint primary key references public.issues(id) on delete cascade,
  lines jsonb not null,
  model text,
  created_at timestamptz not null default now()
);
alter table public.issue_tug_lines enable row level security;
drop policy if exists tug_lines_read on public.issue_tug_lines;
create policy tug_lines_read on public.issue_tug_lines for select using (true);
grant select on public.issue_tug_lines to anon, authenticated;

select cron.unschedule('tug_lines_job') where exists (select 1 from cron.job where jobname = 'tug_lines_job');
select cron.schedule('tug_lines_job', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/tug-lines?n=6',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
