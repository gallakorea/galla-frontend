-- flight_deals — 트래블페이아웃(Aviasales) 서울 출발 최저가 캐시.
-- 엣지 함수 flight-deals 가 하루 두 번(03:23, 15:23) 채운다. 읽기는 누구나(가격 정보).
create table if not exists public.flight_deals (
  dest text primary key,
  city text, country text, country_code text,
  price integer not null,
  depart_date date, return_date date,
  airline text, changes smallint,
  found_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.flight_deals enable row level security;
drop policy if exists flight_deals_read on public.flight_deals;
create policy flight_deals_read on public.flight_deals for select to anon, authenticated using (true);
grant select on public.flight_deals to anon, authenticated;
create index if not exists flight_deals_price_idx on public.flight_deals (price);
