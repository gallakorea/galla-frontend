-- 유튜브가 말하는 채널의 실제 영상 수를 적어 둔다
--
-- 왜: "영상은 다 가져왔나" 를 우리 숫자만 보고는 답할 수 없다. 구독 23만 채널이
-- 13편으로 잡혀 있어도, 그게 '덜 긁은 것'인지 '원래 적은 것'인지 구분이 안 된다.
-- channels.list?part=statistics 는 50개 id 당 1유닛이라 100채널을 물어도 2유닛이다.
alter table travel_channels add column if not exists yt_video_count integer;
alter table travel_channels add column if not exists yt_count_at timestamptz;

-- 컬럼을 더했으면 권한도 같이 준다.
-- ⚠️ 잠긴 테이블에 컬럼만 추가하고 grant 를 빠뜨리면 목록이 통째로 42501 로 백지가 된다.
grant select (yt_video_count, yt_count_at) on travel_channels to anon, authenticated;
