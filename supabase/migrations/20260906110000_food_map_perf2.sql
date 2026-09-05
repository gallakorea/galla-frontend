-- 남은 무거움: 곳마다 도는 서브쿼리 셋과 lateral 조인.
--   'cover'    → food_photos 에서 대표 사진 한 장
--   'photos_n' → food_photos 개수
--   lateral s  → food_place_sources × food_channels 로 채널 목록·영상ID
-- 37,905곳 전부에 대해 돌린 뒤 30개만 자른다. 그래서 32,787블록을 읽는다.
--
-- 이것도 미리 계산해 둔다. 첫 화면은 목록 카드라 정확한 최신값이 아니어도 된다 —
-- 사진이 한 장 늘어난 게 1분 늦게 반영돼도 사용자는 모른다. 대신 화면이 즉시 뜬다.
alter table food_places add column if not exists cover_url text;
alter table food_places add column if not exists photos_n integer not null default 0;

update food_places p set
  cover_url = (select ph.url from food_photos ph
                where ph.place_id = p.id and ph.status='live' order by ph.id desc limit 1),
  photos_n  = (select count(*) from food_photos ph
                where ph.place_id = p.id and ph.status='live');

/* 사진이 들고 날 때 함께 갱신한다 — has_photo 트리거를 확장 */
create or replace function public.food_photo_flag() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare pid uuid := coalesce(new.place_id, old.place_id);
begin
  update food_places p set
    has_photo = exists(select 1 from food_photos ph where ph.place_id = pid and ph.status='live'),
    cover_url = (select ph.url from food_photos ph
                  where ph.place_id = pid and ph.status='live' order by ph.id desc limit 1),
    photos_n  = (select count(*) from food_photos ph
                  where ph.place_id = pid and ph.status='live')
   where p.id = pid;
  return null;
end $$;
