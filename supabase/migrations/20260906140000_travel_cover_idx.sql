-- travel_cover_video 가 곳마다 정렬을 돈다.
--   where place_id = ? and video_id is not null and channel = ?  order by aired_at desc  limit 1
-- 지금 인덱스는 (place_id) 뿐이라, 그 장소의 출처를 다 읽어 매번 정렬한다.
-- 커버는 채널별로 달라야 해서(같은 집도 채널마다 다른 영상) 장소에 미리 담을 수 없다.
-- 대신 이 질의 모양 그대로 인덱스를 준다 — 읽고 바로 첫 줄이 답이 된다.
create index if not exists travel_sources_cover
  on travel_place_sources (place_id, channel, aired_at desc nulls last)
  where video_id is not null;

-- 🔴 중복 인덱스를 지운다. travel_sources_place 와 travel_place_sources_place_idx 가
--    똑같이 (place_id) 다. 쓰기마다 두 번 갱신되고 메모리도 두 배로 먹는다.
--    MICRO 는 메모리 1GB 라 이런 낭비가 캐시 적중률을 갉아먹는다.
drop index if exists travel_sources_place;

-- 맛집 쪽도 같은 모양이 있는지 함께 정리
create index if not exists food_sources_cover
  on food_place_sources (place_id, channel, aired_at desc nulls last)
  where video_id is not null;
