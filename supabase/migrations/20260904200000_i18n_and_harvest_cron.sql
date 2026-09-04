-- ① 번역 수집 — 유튜브 할당량이 리셋되는 **직후**에 먼저 잡는다.
--
-- 유튜브 무료 할당량은 태평양 자정(=KST 16:00)에 리셋된다. 그런데 여행·핫튜브 수집이
-- 하루 종일 돌아 오후엔 이미 소진돼 있다(실측 2026-09-04 오전 10:46 에 videos 403).
-- 번역 수집은 12,819편 ÷ 50 = **257유닛**뿐이라, 리셋 직후 한 시간만 잡으면 다 끝난다.
--   07:00 UTC = 16:00 KST. 5분마다 한 시간 = 12회.
-- 다 받으면 대상이 비어 호출이 0이 된다 — 끄지 않아도 된다.
select cron.schedule('food_video_i18n', '*/5 7 * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/fetch-video-i18n?rounds=30',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);

-- ② 수확을 **채널씩** 돌린다(여행 방식).
--
-- 지금은 한 회차에 3채널을 12편씩 나눠 먹는다 — 회차당 picked 가 12 다.
-- 여행은 한 채널을 100편씩 민다(picked: 100). 같은 110초 안에 8배를 처리한다.
-- 채널을 쪼개 돌리면 시간 상자를 제대로 쓰고, 채널 간 간섭도 없다.
--
-- 남은 수확 대상이 가장 많은 채널 **하나**를 골라 100편을 민다. 2시간마다 → 20분마다.
-- 네이버는 회차당 최대 300콜인데 지금 2,844/20,000(14%) 라 여유가 크다.
select cron.unschedule('food_harvest_creator');
select cron.schedule('food_harvest_creator', '*/20 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/harvest-creator-places?n=100&channel='
           || c.channel,
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000)
  from (
    select v.channel
      from food_videos v
     where v.harvested_at is null
       and (food_has_addr(v.description) or food_has_addr(v.desc_i18n))
     group by v.channel
     order by count(*) desc
     limit 1                      -- 🔴 한 회차에 한 채널만 — 여행과 같은 방식
  ) c;
$$);
