-- 먹보스쭈엥 → 「먹보스 쭈엽이」 채널 연결 (2026-09-12 맛집 크리에이터 QA)
-- 활성인데 가게 0곳이던 유일한 채널. 원인은 **이름 오타** — DB 이름·검색어가 '먹보스쭈엥'/'먹보스 쭈엥'이라
-- 수집기의 채널 이름 검색(search.list)이 한 번도 못 잡았다(resolve_tried_at 만 찍히고 yt_channel_id null, 영상 0편).
-- 실제 채널: UCLwCHoQ9h7DPXvLwx5XwTQg · @mukboss_jjooyup · 제목 「먹보스 쭈엽이」(현주엽 유튜브 채널, 먹방).
-- 채널 페이지 제목과 대조해 넣는다(이름만 보고 팬 채널을 잡은 09-04 사고 재발 방지).
-- yt_channel_id 가 박히면 수집기가 다음 회차부터 업로드 목록을 긁는다(search.list 100유닛 불필요).

update food_channels
   set name = '먹보스 쭈엽이',
       yt_query = '먹보스 쭈엽이',
       yt_channel_id = 'UCLwCHoQ9h7DPXvLwx5XwTQg',
       thumb = coalesce(nullif(thumb, ''), 'https://yt3.googleusercontent.com/_tSLAzYLIzynnpJzxtVURuTvJKIJkIj95v77I5Rktn47C2YXNND6C_Wx6xiORxIWvqY8uE3B=s240-c-k-c0x00ffffff-no-rj')
 where slug = 'meokbosa' and yt_channel_id is null;
