-- 영상 설명란을 저장한다.
-- 제목 매칭은 실패했다(카탈로그 6,495편 × 장소 3,797곳 → **0건**).
-- 또간집 제목이 "국보급 대감 맛집" 식이라 상호가 아예 없기 때문이다.
-- 그런데 **설명란에는 가게 정보를 쓴다** — 수집기가 원래 설명에서 상호를 뽑아왔다.
-- playlistItems 는 snippet 에 description 을 함께 주므로 추가 비용이 0 이다(50편/1유닛).
alter table food_videos add column if not exists description text;
