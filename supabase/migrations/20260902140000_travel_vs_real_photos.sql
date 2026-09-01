-- 어디 갈래 카드에 유튜브 썸네일이 뜨고 있었다 (2026-09-02)
--
-- 사장님: "사진이 다 안 나오잖아." 실제로 카드에 뜬 건 장소 사진이 아니라
-- **크리에이터 영상 썸네일**이었다 — '곳 여행', '조 정통 꼬치 전문' 같은 자막이
-- 큼직하게 박힌 이미지다. travel_cover() 가 장소 사진이 없으면 영상 썸네일로
-- 폴백하기 때문인데, 상세 화면에서는 그게 맞지만 **사진으로 고르는 게임에서는 치명적**이다.
-- 자막 덩어리 두 장을 놓고 "어디 갈래"라고 물으면 아무도 못 고른다.
--
-- → 카드 사진은 travel_places.photo(위키미디어 커먼즈·관광공사)만 쓴다.
--    풀이 891 → 622곳으로 줄지만 16강에는 넘치고, 사진 없는 269곳은
--    커먼즈 적재가 돌면 자연히 들어온다.
-- ⚠️ 컬럼을 끼워 넣으므로 create-or-replace 로는 못 바꾼다(순서가 바뀌면 42P16).
drop view if exists travel_vs_pool;
create view travel_vs_pool as
  select p.id, p.sid, p.slug, p.name, p.country, p.country_code,
         coalesce(p.city, p.admin1) as area, p.scale,
         p.photo as cover, p.photo_credit,
         round(travel_km(37.5665, 126.9780, p.lat, p.lon))::int as km,
         (select count(*) from travel_certs c where c.place_id = p.id)::int as certs,
         coalesce((select sum(distinct ch.subs) from travel_place_sources s
                     join travel_channels ch on ch.slug = s.channel
                    where s.place_id = p.id), 0)::bigint as subs,
         (select count(distinct s.channel) from travel_place_sources s
           where s.place_id = p.id)::int as creators
    from travel_places p
   where p.status = 'live'
     and p.scale in ('spot', 'city')
     and p.lat is not null
     and p.country is not null
     and p.name ~ '[가-힣]'
     and p.name <> p.country
     and p.photo is not null                      -- ⚠️ 영상 썸네일 폴백을 쓰지 않는다
     and exists (select 1 from travel_place_sources s where s.place_id = p.id);

grant select on travel_vs_pool to anon, authenticated;
