-- 📊 학습엔진 관제 — 자가개선 루프(수집→보상→기억개선→증류)가 실제로 도는지 관리자가 본다.
--    개인정보 없이 집계만(기억 content 미노출 — PII 원칙). _is_admin 게이트.
create or replace function public.admin_learning_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not _is_admin() then return jsonb_build_object('error','forbidden'); end if;
  select jsonb_build_object(
    'sft', jsonb_build_object(
      'total', (select count(*) from sft_samples),
      'by_source', (select coalesce(jsonb_object_agg(source, n), '{}'::jsonb) from (select source, count(*) n from sft_samples group by source) t),
      'by_brain', (select coalesce(jsonb_object_agg(coalesce(brain,'?'), n), '{}'::jsonb) from (select brain, count(*) n from sft_samples group by brain) t),
      'added_7d', (select count(*) from sft_samples where created_at > now() - interval '7 days')
    ),
    'reward', jsonb_build_object(
      'avg_companion', (select round(avg(reward)::numeric,2) from sft_samples where brain='companion' and source='friend_chat'),
      'avg_agent', (select round(avg(reward)::numeric,2) from sft_samples where brain='agent' and source='friend_chat'),
      'positive', (select count(*) from sft_samples where source='friend_chat' and reward >= 2),
      'negative', (select count(*) from sft_samples where source='friend_chat' and reward <= -2),
      'distill_queue', (select count(*) from sft_samples where source='friend_chat' and reward <= -2 and not (coalesce(tags,'{}') @> array['distilled']))
    ),
    'distill', jsonb_build_object(
      'teacher_total', (select count(*) from sft_samples where source in ('distill_claude','distill_auto')),
      'auto_total', (select count(*) from sft_samples where source='distill_auto'),
      'processed', (select count(*) from sft_samples where coalesce(tags,'{}') @> array['distilled'])
    ),
    'memory', jsonb_build_object(
      'active', (select count(*) from friend_memory where status='active'),
      'users', (select count(distinct user_id) from friend_memory where status='active'),
      'rewarded', (select count(*) from friend_memory where status='active' and use_count > 0),
      'avg_ema', (select round(avg(reward_ema)::numeric,2) from friend_memory where status='active' and use_count > 0),
      'winners', (select count(*) from friend_memory where status='active' and reward_ema >= 1),
      'losers', (select count(*) from friend_memory where status='active' and reward_ema <= -1)
    ),
    'crons', (select coalesce(jsonb_object_agg(jobname, jsonb_build_object('status', status, 'at', to_char(end_time,'MM-DD HH24:MI'))), '{}'::jsonb)
      from (select distinct on (j.jobname) j.jobname, d.status, d.end_time
            from cron.job j join cron.job_run_details d on d.jobid=j.jobid
            where j.jobname in ('curate-sft-daily','curate-creation-daily','friend_memory_maintain_job','distill-failures-daily','galvis_ping_daily')
            order by j.jobname, d.end_time desc) t)
  ) into v;
  return v;
end $$;
revoke all on function public.admin_learning_stats() from public, anon;   -- PUBLIC 기본 grant까지 회수(anon 401)
grant execute on function public.admin_learning_stats() to authenticated;
