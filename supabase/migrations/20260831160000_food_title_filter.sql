-- 제목 필터 (2026-08-31)
-- 실측: '또간집' 채널 ID(UC4ZA57...)는 제작사 '스튜디오 수제'가 맞는데, 이 채널은 여러 프로그램과
--   쇼츠를 같이 올린다. 최신 8편이 전부 무관한 쇼츠였고 추출 0건이 나왔다(AI는 정상, 입력이 문제).
-- → 제작사 채널은 제목으로 해당 프로그램만 걸러낸다. 전용 채널(쯔양 등)은 null 로 두고 전량 수집.
alter table public.food_channels add column if not exists yt_title_re text;

update public.food_channels set yt_title_re = '또간집'            where slug='ttoganjib';
update public.food_channels set yt_title_re = '먹을텐데'          where slug='meogeulteonde';
update public.food_channels set yt_title_re = '전현무계획'        where slug='jeonhyeonmu';
update public.food_channels set yt_title_re = '백반기행'          where slug='baekban';
update public.food_channels set yt_title_re = '맛있는\s*녀석들'   where slug='matnyeoseok';
update public.food_channels set yt_title_re = '한국인의\s*밥상'   where slug='bapsang';
update public.food_channels set yt_title_re = '흑백요리사'        where slug='heukbaek';
update public.food_channels set yt_title_re = '동네\s*한\s*바퀴'  where slug='dongne';
-- 쯔양·김사원세끼는 전용 채널이라 전량 수집(필터 없음)
update public.food_channels set last_video_at = null;
select slug, name, yt_title_re from public.food_channels order by sort;
