-- '어디 갈래' 풀이 분류(genre)를 쓴다 (2026-09-02)
--
-- 지금은 이름으로 역·공항만 걸러내고 있다. 그래서 방콕 노점('란 제이 파이')·시장이
-- 여전히 섞여 있고, 사장님이 "설레지 않는다"고 하신 판이 그것들이다.
-- 분류기를 켰으니 travel_genre_defs.in_pool 로 규칙을 데이터에 맡긴다:
--   in_pool=true  자연·유적·사찰·박물관·랜드마크·테마파크·온천·시장
--   in_pool=false 식당·숙소·교통·기타   ← '가고 싶은 곳'을 묻는 대상이 아니다
--
-- ⚠️ **아직 분류 안 된 곳(genre is null)은 남긴다.** 지금 11,000곳이 미분류라
--    그걸 빼면 풀이 통째로 비어 게임이 죽는다. 분류가 채워질수록 자연히 정확해진다.
-- ⚠️ 이름 기반 교통 필터는 그대로 둔다 — 분류가 닿기 전에도 이태원역은 막아야 한다.
drop view if exists travel_vs_pool;
create view travel_vs_pool as
  select p.id, p.sid, p.slug, p.name, p.country, p.country_code,
         coalesce(p.city, p.admin1) as area, p.scale, p.genre,
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
     and p.scale = 'spot'
     and p.lat is not null
     and p.country is not null
     and p.name ~ '[가-힣]'
     and p.name <> p.country
     and p.name !~ '(역|공항|터미널|정류장|나들목|휴게소|IC)$'
     and p.photo is not null
     and (p.genre is null
          or exists (select 1 from travel_genre_defs d
                      where d.code = p.genre and d.in_pool))
     and exists (select 1 from travel_place_sources s where s.place_id = p.id);

grant select on travel_vs_pool to anon, authenticated;
