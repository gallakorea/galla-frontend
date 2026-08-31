-- 사진 출처를 구분한다 — 4,076곳 중 사진이 **0곳**이었다(실측 2026-08-31).
-- 유저 제보만으로는 영원히 안 채워지므로 공공 데이터에서 끌어온다.
--
-- ⚠️ user_id 가 NOT NULL 이라 기계가 넣을 수가 없었다. null 을 허용하고
--    대신 source 로 누가 넣었는지 남긴다.
-- ⚠️ 공공누리 데이터(관광공사)는 **출처 표시가 의무**다. credit 에 담아 화면에 띄운다.
alter table food_photos alter column user_id drop not null;
alter table food_photos add column if not exists source text not null default 'user';
alter table food_photos add column if not exists credit text;
alter table food_photos add column if not exists ext_key text;

-- 같은 출처에서 같은 사진을 두 번 넣지 않는다
create unique index if not exists food_photos_ext
  on food_photos (place_id, ext_key) where ext_key is not null;

-- 유저가 올린 사진이 기계 사진보다 항상 위다(그 집 실제 사진이니까).
create or replace function food_cover(p_place uuid)
returns text language sql stable security definer set search_path = public as $$
  select url from food_photos
   where place_id = p_place and status = 'live'
   order by (source = 'user') desc, id desc
   limit 1;
$$;
grant execute on function food_cover(uuid) to anon, authenticated;
