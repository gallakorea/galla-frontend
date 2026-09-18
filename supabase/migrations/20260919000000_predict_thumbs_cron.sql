-- 진행 중인데 사진 없는 예측에 썸네일(이슈 사진 → 없으면 FLUX 생성)을 매시 25분에 채운다(26.9.18).
select cron.unschedule('predict_thumbs_job') where exists (select 1 from cron.job where jobname = 'predict_thumbs_job');
select cron.schedule('predict_thumbs_job', '25 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/predict-thumbs?n=8',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
