-- 🔴 앱이 버벅인다. food_map 이 30곳 뽑는 데 **50,888 블록(약 400MB)** 을 읽고 있었다.
--    MICRO 는 메모리 1GB 라 이 한 번으로 캐시가 통째로 뒤집힌다 — 다음 요청이 전부 느려진다.
--
-- 원인: 정렬과 필터가 **37,905곳 전부**에 대해 무거운 계산을 돌린 뒤 30개만 자른다.
--   order by ... (exists (select 1 from food_photos where place_id = p.id ...)) desc
--   그 exists 가 정렬에 두 번, row_number() 윈도우 안에 한 번 — 곳마다 서브쿼리다.
--
-- 고치는 법: '사진이 있나'는 **미리 계산해 컬럼에 둔다.** 정렬이 인덱스로 끝난다.
alter table food_places add column if not exists has_photo boolean not null default false;

update food_places p set has_photo = exists(
  select 1 from food_photos ph where ph.place_id = p.id and ph.status = 'live')
 where p.has_photo is distinct from exists(
  select 1 from food_photos ph where ph.place_id = p.id and ph.status = 'live');

/* 사진이 들고 날 때 자동으로 맞춘다 */
create or replace function public.food_photo_flag() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare pid uuid := coalesce(new.place_id, old.place_id);
begin
  update food_places p set has_photo = exists(
    select 1 from food_photos ph where ph.place_id = pid and ph.status = 'live')
   where p.id = pid;
  return null;
end $$;
drop trigger if exists food_photo_flag_t on food_photos;
create trigger food_photo_flag_t after insert or update or delete on food_photos
  for each row execute function public.food_photo_flag();

/* 첫 화면 정렬(사진 있는 것 먼저, 최신순)이 인덱스만으로 끝나게 */
create index if not exists food_places_map_order
  on food_places (has_photo desc, created_at desc) where status = 'live';
create index if not exists food_places_region_order
  on food_places (region, has_photo desc, created_at desc) where status = 'live';
