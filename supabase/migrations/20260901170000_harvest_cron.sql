-- 수확을 크론에 올린다. 손 떼도 계속 쌓이게.
--
-- ⚠️ 채널을 하드코딩하지 않는다 — 크리에이터는 계속 늘어난다.
--    '아직 안 물어본, 주소 있는 영상'이 남아 있는 채널을 그때그때 골라 세 개씩 돈다.
-- ⚠️ 회차당 12편으로 묶는다. 영상 하나에 LLM 1회 + 네이버 최대 3회라,
--    더 키우면 엣지 150초 유휴 타임아웃에 걸린다(실측: 12편에 약 90초).
select cron.schedule('food_harvest_creator', '35 */2 * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/harvest-creator-places?n=12&channel='
           || c.channel,
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000)
  from (
    select v.channel
      from food_videos v
     where v.harvested_at is null
       and v.description ~ '[가-힣]+(시|군|구)\s*[가-힣0-9]+(로|길)\s*[0-9]'
     group by v.channel
     order by count(*) desc
     limit 3
  ) c;
$$);
