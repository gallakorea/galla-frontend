-- 크리에이터 확대 + 영상에서 가게를 만들어내는 파이프라인의 뼈대.
--
-- 지금까지는 '가게를 먼저 모으고 영상을 나중에 붙이는' 방향이었다. 그게 3%에서 멈춘 이유다.
-- 참조 서비스가 영상 썸네일을 다는 건 **영상에서 가게를 뽑아 목록을 만들었기** 때문이다.
-- 방향을 뒤집으면 새로 들어오는 집은 태어날 때부터 영상 ID 를 달고 온다.
--
-- 채널 선정 기준은 구독자가 아니라 **설명에 주소를 쓰는 비율**이다(각 200편 실측):
--   윤호찌 66% · 대구형제 55% · 임해장 25%  →  채택
--   맛집남자 0%(50만 구독) · 찹찹대학 1% · 살찐삼촌 3%  →  탈락
-- 50만 구독이 0%고 3만 구독이 25%다. 구독자 수는 쓸모와 상관이 없었다.

insert into food_channels (slug, name, kind, yt_channel_id, thumb, active) values
  ('yunhojji',   '윤호찌',            'yt', 'UCiWcXU1zYrEONKQtNVGr_Jw',
   'https://yt3.ggpht.com/aKBE3CLP-ULTqI4k8TJU66gWao3kXGgbXVHHvCnSjoQvTsJEAfPt5m6L7ZUh3eJmRb6fs7_2=s240-c-k-c0x00ffffff-no-rj', true),
  ('daeguhyeong','대구형제_대구맛집',   'yt', 'UCpX8i6oWeajas-64cNeMjMw',
   'https://yt3.ggpht.com/ytc/AIdro_lLCKguEE6-Os0DS3nn7nCLA0eyNgDW1ykDKRQ8xHQHHyQ=s240-c-k-c0x00ffffff-no-rj', true),
  ('limhaejang','임해장',            'yt', 'UC_yQCVU_68rWQiEpuuCSMlA',
   'https://yt3.ggpht.com/gnRcOQsLUDCMRup3iStbyBSls1YGYTuWaB-sn3L0d4fQOJAWfMMjtTT9pnT18zDK7e21eNyxuQ=s240-c-k-c0x00ffffff-no-rj', true)
on conflict (slug) do update
  set yt_channel_id = excluded.yt_channel_id,
      thumb = excluded.thumb,
      active = true;

-- 수확 원장. ⚠️ '성공했을 때만 도장 찍기'는 오늘 네 번 밟은 함정이다 —
--    실패한 영상을 안 찍으면 매 회차 같은 영상을 다시 LLM 에 태우고 네이버를 다시 부른다.
--    결과와 무관하게 '물어봤다'를 남긴다.
alter table food_videos add column if not exists harvested_at timestamptz;
create index if not exists food_videos_harvest
  on food_videos (channel, harvested_at nulls first);
