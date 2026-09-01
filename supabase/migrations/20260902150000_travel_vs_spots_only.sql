-- 어디 갈래: 도시와 교통시설을 뺀다 (2026-09-02)
--
-- 사장님: "저렇게 사진이 나오니 어딘지도 모르겠다고."
-- 실제로 '더블린 vs 카이로'가 나왔는데 둘 다 **어느 도시인지 알 수 없는 항공 전경**이었다.
-- 위키데이터 대표 이미지(P18)가 도시에는 대개 밋밋한 전경이나 콜라주라 그렇다.
-- 명소는 반대다 — 사진이 곧 그 장소다(기자의 피라미드·도톤보리·후지산·광한루원).
--
-- 두 가지를 뺀다:
--   ① 도시(scale='city') — 사진으로 구별이 안 되면 "어디 갈래"가 성립하지 않는다.
--      나중에 위키보이저 배너(P948, 여행용으로 고른 사진)를 적재하면 되살릴 수 있다.
--   ② 역·공항·터미널 — 크리에이터가 영상에서 자주 말해서 명소로 뽑혀 들어왔는데
--      (이태원역 승강장, 쓰시마역 주차장, 인천공항전망대) 아무도 여기 '가고 싶어' 하지 않는다.
--      게임뿐 아니라 랭킹 품질에도 해롭다.
--
-- 남는 풀 302곳. 16강 한 판에 16곳이라 여러 판을 돌리기에 충분하고,
-- 수확·커먼즈 사진 적재가 돌면 계속 는다.
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
     and p.scale = 'spot'
     and p.lat is not null
     and p.country is not null
     and p.name ~ '[가-힣]'
     and p.name <> p.country
     and p.name !~ '(역|공항|터미널|정류장|나들목|휴게소|IC)$'
     and p.photo is not null
     and exists (select 1 from travel_place_sources s where s.place_id = p.id);

grant select on travel_vs_pool to anon, authenticated;
