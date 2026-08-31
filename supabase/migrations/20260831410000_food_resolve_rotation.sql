-- 채널 ID 해소 회전 — search.list 는 100유닛짜리라 하루 쿼터(10,000)를 금방 먹는다.
-- 지금까지는 매 실행 미해소 채널을 처음부터 다시 시도해서, 쿼터가 마르면
-- **앞쪽 몇 개에서만 낭비하고 뒤쪽은 영원히 순서가 오지 않았다**
-- (실측 2026-08-31: 42개 중 21개가 yt_channel_id = null 인 채로 정체).
-- 시도 시각을 남겨 오래 안 해본 것부터 돌게 한다.
alter table food_channels add column if not exists resolve_tried_at timestamptz;
