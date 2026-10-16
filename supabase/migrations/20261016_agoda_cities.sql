-- 🏨 아고다 도시 표(26.10.16) — 숙소 검색(galla-friend hotel_search)이 도시 이름 → 아고다 city_id 로 바꿀 때 쓴다.
-- 아고다 파트너 '숙소 데이터 파일'에서 도시별로 묶어 적재(hotels = 그 도시 숙소 수, 동명 도시 중 큰 곳 우선).
create table if not exists public.agoda_cities (
  city_id   bigint primary key,
  name_en   text not null,
  name_ko   text,
  country   text,
  hotels    int default 0,
  aliases   text[] default '{}'
);
create index if not exists agoda_cities_name_en_idx on public.agoda_cities (lower(name_en));
create index if not exists agoda_cities_aliases_idx on public.agoda_cities using gin (aliases);
alter table public.agoda_cities enable row level security;   -- 서버(서비스 키)만 읽는다
