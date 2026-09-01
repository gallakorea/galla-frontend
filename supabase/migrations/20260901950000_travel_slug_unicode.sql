-- slug 가 한글·영어 아닌 글자를 통째로 버리고 있었다 + 색인 범위 정리 (2026-09-01)
--
-- ① 실측: 'Bursa and Cumalıkızık' → 'bursa-and-cumal-k-z-k',
--         'Café Ölüdeniz' → 'caf-l-deniz'.
--    직접 만든 문자 클래스 '[가-힣a-z0-9]' 가 터키어 ı·프랑스어 é 를 못 알아본 것이다.
--    전 세계 여행지를 다루면서 라틴 확장·키릴·태국어를 버리면 주소가 쓰레기가 된다.
--    → PostgreSQL 의 [[:alnum:]] 는 UTF-8 에서 유니코드를 안다(실측 확인). 그걸 쓴다.
--
-- ② 나라(111)·광역(118)은 색인에서 뺀다. '튀르키예'라는 제목의 페이지가 본문에
--    '튀르키예'만 적혀 있으면 검색결과에서 아무 값도 못 하고, 그런 페이지가 수백 개면
--    사이트 전체 품질 신호를 깎는다. 도시·명소만 남긴다(spot 761 + city 289).
-- ⚠️ slug 를 바꾸는 건 색인이 시작되기 전인 지금뿐이다. 나중엔 301 비용이 붙는다.

create or replace function travel_slugify(p_name text)
returns text language sql immutable as $$
  select nullif(btrim(regexp_replace(
           regexp_replace(lower(coalesce(p_name,'')), '[^[:alnum:]]+', '-', 'g'),
           '-{2,}', '-', 'g'), '-'), '')
$$;

update travel_places
   set slug = coalesce(left(travel_slugify(name), 60), 'place')
 where slug is distinct from coalesce(left(travel_slugify(name), 60), 'place');

create or replace view travel_sitemap_v as
  select p.id, p.slug, p.sid, p.name, p.country, p.updated_at, p.created_at
    from travel_places p
   where p.status = 'live'
     and p.slug is not null
     and coalesce(p.scale, 'spot') in ('spot', 'city')
     and (exists (select 1 from travel_place_sources s where s.place_id = p.id)
          or length(coalesce(p.summary, '')) >= 80);

grant select on travel_sitemap_v to anon, authenticated;
