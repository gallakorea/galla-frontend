-- 여행지 유형 분류 크론 (2026-09-02)
--
-- 사장님: "시간 되면 자동으로 진행해."
-- 원래 '수확 끝난 뒤'로 미뤄 뒀는데, 그 이유("지금 돌리면 나중에 또 분류해야 한다")가
-- 사실이 아니었다. 분류기는 **genre 가 null 인 것만** 집는다 — 한 장소를 두 번 부르지 않고,
-- 나중에 들어온 장소는 그때 알아서 집힌다. 미룰 이유가 없어서 지금 켠다.
--
-- ⚠️ 이걸 켜야 '어디 갈래' 풀에서 식당·숙소·역이 빠진다(travel_genre_defs.in_pool=false).
--    지금 풀에 방콕 노점과 이태원역이 섞여 있는 건 분류가 없어서다.
-- 💰 회차당 50곳, 25곳씩 묶어 물어본다. 11,000곳이면 220회차 — 10분 주기로 하루 반이면 끝난다.
-- ⚠️ 다른 AI 크론(요약 2·12·22…, 장소별 한줄 7·27·47)과 분을 어긋나게 둔다.
select cron.schedule(
  'travel_classify_job', '5,15,25,35,45,55 * * * *', $cmd$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/travel-classify?n=50',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 140000);
  $cmd$);
