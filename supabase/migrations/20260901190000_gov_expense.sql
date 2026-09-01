-- 지자체 업무추진비 → 공무원이 다녀간 집.
--
-- 서울시 본청 odExpense 는 EXEC_LOC 에 '상호(도로명주소)' 가 한 칸으로 들어온다.
--   실측: 40건 중 38건(95%)에 도로명 주소 포함. 국회 데이터(상호만)보다 오히려 낫다 —
--         주소가 같이 오니 네이버 검증의 지역 대조가 정확해진다.
-- 라이선스: 공공누리 1유형(출처표시, 상업적 이용·변경 가능).
--
-- ⚠️ 채널을 '공무원' 하나로 뭉치지 않는다. '누가 갔나'는 누구인지가 정보다 —
--    서울시청과 강남구청은 다른 주체다. 기관별로 세운다.

insert into food_channels (slug, name, kind, active) values
  ('seoul_gov', '서울시 공무원', 'gov', true)
on conflict (slug) do update set name = excluded.name, active = true;

-- 어디까지 읽었나. API 는 순차 페이징이라 커서가 없으면 매번 처음부터 읽는다.
create table if not exists gov_ingest_cursor (
  source text primary key,
  next_offset integer not null default 1,
  total integer,
  updated_at timestamptz not null default now()
);
alter table gov_ingest_cursor enable row level security;

-- 같은 가게가 수십 번 나온다(설품·오복수산참치…). 한 번 물어본 장소는 다시 안 묻는다.
-- ⚠️ 성공했을 때만 남기면 실패한 장소를 매 회차 네이버에 다시 묻는다 — 결과와 무관하게 남긴다.
create table if not exists gov_expense_seen (
  loc_key text primary key,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table gov_expense_seen enable row level security;

insert into gov_ingest_cursor (source, next_offset) values ('seoul_odExpense', 1)
on conflict (source) do nothing;
