-- 여행지 날씨 캐시(26.9.18 사장님 「해외 날씨도」) — MET Norway 를 좌표 0.1°(약 11km) 칸마다 한 시간에 한 번만 부른다.
-- 클라이언트는 직접 못 읽는다(엣지 travel-weather 가 service role 로만 읽고 쓴다).
create table if not exists public.travel_wx_cache (
  key text primary key,          -- 'lat1|lon1' (소수 1자리)
  data jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.travel_wx_cache enable row level security;
