-- ⏰ 신규 영상 자동 이관 크론 (2026-08-09)
--  5분마다 큐를 집어 인코딩이 끝난 영상부터 R2로 옮긴다.
--  ⚠️ 인증은 기존 크론과 동일하게 x-cron-secret(Vault) + anon JWT를 쓴다.
--     워커가 이 시크릿을 검증한다 — 열어두면 아무나 이관을 돌려 Stream 요금이 나간다.

-- 크론 시크릿 대조용(워커가 호출). 시크릿 값 자체는 절대 밖으로 내보내지 않는다.
create or replace function public.cron_secret_matches(p_secret text)
returns boolean language sql security definer set search_path to 'public, vault' as $$
  select coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret') = p_secret,
    false);
$$;
revoke all on function public.cron_secret_matches(text) from anon, authenticated;

select cron.unschedule('video_migrate_job')
 where exists (select 1 from cron.job where jobname = 'video_migrate_job');

select cron.schedule('video_migrate_job', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/video-migrate-worker',
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM'),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$job$);
