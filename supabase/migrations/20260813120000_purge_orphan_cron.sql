-- =========================================================
-- 고아 미디어 청소 크론 — 참조 캐시 갱신(04:40) 뒤 05:00 에 실행
--
-- 순서가 중요하다: 캐시가 먼저 채워져야 그날 올라온 파일이 '참조됨'으로 잡힌다.
-- (purge 함수 자체도 캐시가 48시간 넘으면 중단한다 — 순서가 어긋나도 안전)
--
-- apply:true 로 실제 삭제한다. 안전장치는 함수 안에 있다:
--   참조 0건 중단 · 고아 과반 중단 · 캐시 노후 중단 · HLS 폴더 보호 · 1회 500개 상한
-- 유예 7일 — 올린 직후 아직 폼에 안 붙은 파일을 지우지 않는다.
-- =========================================================

select cron.unschedule('purge_orphan_media')
 where exists (select 1 from cron.job where jobname = 'purge_orphan_media');

select cron.schedule('purge_orphan_media', '0 20 * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/purge-orphan-media',
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type', 'application/json'),
    body := jsonb_build_object('apply', true, 'grace_days', 7, 'max_delete', 500)
  )
$$);
