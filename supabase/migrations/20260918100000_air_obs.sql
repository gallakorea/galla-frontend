-- 미세먼지(에어코리아 실시간, 26.9.18 사장님 「미세먼지 정보도 얹자 지도랑 다른데도」)
-- 측정소 좌표 API(측정소정보)는 활용신청이 안 돼 403 → 측정소 이름을 우리 지역표(시군구·읍면동)에 맞춰 붙인다.
create table if not exists public.air_station_obs (
  station text not null, sido text not null,
  pm10 numeric, pm25 numeric, khai numeric,
  data_time text, updated_at timestamptz not null default now(),
  primary key (sido, station)
);
alter table public.air_station_obs enable row level security;

/* 측정소 → 시군구(weather_regions.kind='city') 연결.
   ① 시군구 이름과 같다(종로구→종로, 수원시→수원 …)  ② 읍면동 이름과 같다(금왕→금왕읍) → 그 동의 시군구 */
create or replace function public.air_station_region(p_sido text, p_station text)
returns text language sql stable security definer set search_path to 'public' as $$
  with s as (select code from weather_regions where kind='sido' and name = p_sido),
  nm as (select regexp_replace(p_station, '(특별자치시|특별시|광역시|구|시|군)$', '') k,
                regexp_replace(p_station, '(동|읍|면|리)$', '') k2)
  select coalesce(
    (select c.code from weather_regions c, s, nm where c.kind='city' and c.parent = s.code
       and (c.name = p_station or c.name = nm.k or regexp_replace(c.name,'(구|시|군)$','') = nm.k) limit 1),
    (select d.parent from weather_regions d, s, nm, weather_regions c where d.kind='dong' and c.code = d.parent and c.parent = s.code
       and regexp_replace(regexp_replace(d.name,'[0-9·.]+',''), '(동|읍|면)$','') = nm.k2 limit 1)
  );
$$;

/* 지역별 미세먼지 — 시군구 = 그 구역 측정소 평균, 없으면 시도 평균(est=true). 시도 = 시도 전체 평균 */
create or replace view public.air_region as
  with st as (
    select a.*, public.air_station_region(a.sido, a.station) city,
           (select code from weather_regions where kind='sido' and name=a.sido) sido_code
      from air_station_obs a where a.updated_at > now() - interval '3 hours'
  ),
  sido as (select sido_code region, round(avg(pm10)) pm10, round(avg(pm25)) pm25, count(*) n, max(data_time) data_time
             from st where sido_code is not null group by 1),
  city as (select city region, round(avg(pm10)) pm10, round(avg(pm25)) pm25, count(*) n, max(data_time) data_time
             from st where city is not null group by 1)
  select region, pm10, pm25, n, data_time, false est from sido
  union all select region, pm10, pm25, n, data_time, false from city
  union all select c.code, s.pm10, s.pm25, 0, s.data_time, true
    from weather_regions c join sido s on s.region = c.parent
   where c.kind='city' and not exists (select 1 from city x where x.region = c.code);
