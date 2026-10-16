-- 🏨 아고다 숙소 표(26.10.16) — 숙소 검색의 상세 필터(유형·지역·성급·평점)와 상세 화면(사진·주소·체크인 시간)용.
-- 아고다 파트너 '숙소 데이터 파일'에서 한국인 여행 수요가 있는 나라만, 리뷰나 성급이 있는 곳만 적재. 실시간 요금은 API 로 따로.
create table if not exists public.agoda_hotels (
  hotel_id      bigint primary key,
  city_id       bigint not null,
  name          text not null,
  type          text,          -- 정규화 키: hotel/resort/hostel/guesthouse/apartment/house/ryokan/capsule/motel/pension/camping
  type_raw      text,
  star          real default 0,
  rating        real default 0,
  reviews       int  default 0,
  lat           double precision,
  lng           double precision,
  address       text,
  zipcode       text,
  photos        text[] default '{}',
  overview      text,
  checkin_time  text,
  checkout_time text,
  rooms         int,
  floors        int,
  year_opened   int,
  year_renovated int,
  chain         text,
  rates_from_usd real
);
create index if not exists agoda_hotels_city_idx on public.agoda_hotels (city_id, reviews desc);
create index if not exists agoda_hotels_city_type_idx on public.agoda_hotels (city_id, type);
alter table public.agoda_hotels enable row level security;   -- 서버(서비스 키)만

-- 도시별 유형 개수(필터 칩) — 서비스 키로만 부른다
create or replace function public.agoda_city_types(p_city bigint)
returns table(type text, n bigint) language sql stable as $$
  select type, count(*) from public.agoda_hotels where city_id = p_city and type is not null group by type order by 2 desc
$$;
revoke all on function public.agoda_city_types(bigint) from public, anon, authenticated;
