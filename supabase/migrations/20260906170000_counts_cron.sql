-- 미리 세어 둔 값들을 주기적으로 맞춘다.
-- 목록 화면은 몇 분 늦은 숫자여도 사용자가 모른다. 대신 화면이 즉시 뜬다.
--   food_channels.place_n / travel_channels.place_n — 채널별 장소 수
--   food_region_counts — 지역별 가게 수
-- 셋 다 수집 크론이 돌 때만 바뀌므로 20분이면 충분하다.
select cron.schedule('counts_refresh', '*/20 * * * *', $$
  select food_channel_counts_refresh();
  select travel_channel_counts_refresh();
  select food_region_counts_refresh();
$$);
