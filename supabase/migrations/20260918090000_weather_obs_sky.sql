-- 기상청 하늘상태(SKY) 캐시 — 초단기실황엔 SKY 가 없어 비가 안 오면 전부 '맑음'이 됐다(26.9.18).
-- SKY 는 초단기예보에서 3시간마다만 받고(하루 호출 한도 1만), 사이 시간엔 이 값을 쓴다.
alter table public.weather_obs add column if not exists sky smallint, add column if not exists sky_at timestamptz;
