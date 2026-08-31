/* 릴스 에이전트 작업이 중간 상태에서 죽으면 영원히 그대로 남았다 —
   'aligning' 6건·'rendering' 1건이 2026-08-15 부터 389시간째 그 상태였다.
   화면에서는 계속 진행 중으로 보이므로 사장님은 끝나기를 기다리게 된다.

   정상 작업은 평균 12분·p95 19분이다(done 72건 실측). 90분이면 4.7배 여유다.
   'preview' 는 승인 대기라 건드리지 않는다 — 사람이 볼 때까지 남아 있어야 하는 상태다. */
create or replace function public.reap_stalled_agent_jobs(p_minutes int default 90)
returns int language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  update agent_jobs
     set state = 'failed',
         error = coalesce(nullif(error,''), 'stalled: ' || state || ' 상태에서 ' || p_minutes || '분 넘게 진행 없음'),
         updated_at = now()
   where state in ('processing','aligning','rendering','render_queued')
     and updated_at < now() - make_interval(mins => p_minutes);
  get diagnostics n = row_count;
  return n;
end $$;

select cron.schedule('reap_stalled_agent_jobs', '*/15 * * * *', 'select public.reap_stalled_agent_jobs(90);');
