-- 여행지 층 추가 (2026-09-01) — 실측이 설계를 바꾼 자리다.
--
-- 실측: 빠니보틀 최근 50편의 제목·설명에 **구체적인 장소가 거의 없다**.
--   "방글라데시", "에티오피아", "지중해 크루즈", "하동" — 전부 지역 단위다.
--   구체 상호·명소는 영상 안에서 말할 뿐 메타데이터에 안 쓴다(자막은 공식 경로가 없다).
--   맛집이 '쯔양·또간집 240편에서 0건'으로 맞았던 벽과 같은 벽이다.
--
-- → 그래서 여행의 기본 단위는 가게가 아니라 **여행지(나라·지역·도시)** 다.
--   크리에이터 영상에서 확실히 뽑히는 것도 이것이고, 유저가 다툴 대상도 이것이다
--   ("빠니보틀이 간 다카, 갈 만하냐"). 그 안의 스팟(POI)은 공공데이터로 채우고,
--   설명에 상호를 쓰는 영상이 나오면 그때 스팟으로 붙인다.
--
-- scale 로 층을 가른다. 지도 줌 레벨·목록 묶음·랭킹이 전부 이 값으로 갈린다.
alter table public.travel_places
  add column if not exists scale text not null default 'spot'
  check (scale in ('country','region','city','spot'));

create index if not exists travel_places_scale
  on public.travel_places (scale, country_code, created_at desc) where status='live';
