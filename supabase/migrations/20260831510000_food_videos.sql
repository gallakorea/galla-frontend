-- 방송 영상 카탈로그 — 사진 없는 집에 '그 집이 나온 영상'의 썸네일을 붙이기 위한 색인.
--
-- 배경: 장소 4,076곳 중 영상이 연결된 건 253곳뿐이었다. 나머지는 블로그 스윕으로
--   들어와서 어느 영상에 나왔는지를 모른다. 그런데 채널들은 제목에 상호를 쓴다
--   ("또간집 33회 성수동 ○○○"). 업로드 플레이리스트는 50편에 1유닛이라 아주 싸다.
--   → 채널 전체 영상 제목을 받아두고, 상호가 제목에 들어간 영상을 찾아 연결한다.
create table if not exists food_videos (
  channel      text not null references food_channels(slug) on delete cascade,
  video_id     text not null,
  title        text not null,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  primary key (channel, video_id)
);
create index if not exists food_videos_ch on food_videos(channel);

alter table food_videos enable row level security;
-- 읽기는 서비스 내부용이라 열지 않는다(연결 결과만 food_place_sources 로 나간다).
grant select, insert, update, delete on food_videos to service_role;
