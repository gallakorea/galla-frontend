-- 수확 속도 재조정 (2026-09-01)
--
-- 실측: 영상 31,074편 중 수확된 건 525편뿐이었다(15분마다 20편 = 하루 1,920편 → 16일치).
-- 사장님이 "왜 다 없어?"라고 물은 이유가 이것이다. 수집은 다 됐고 **수확이 밀린 것**이다.
--
-- ⚠️ 편수를 45로 올렸더니 회차가 엣지 유휴 150초를 넘겨 **통째로 날아갔다**(응답조차 없다).
--    20편이 약 60초였으니 30편이 안전선이다. 편수 대신 **주기**를 당긴다.
--    15분 → 5분, 30편  =  하루 8,640편  →  밀린 3만 편을 3~4일에 소화한다.
-- ⚠️ 지오코딩 장부를 8,000으로 올린다(하루 약 6,000 호출 예상).
--    Nominatim 정책의 핵심은 총량이 아니라 **초당 1회**이고, 런 안에서 1.1초 간격을 지키며
--    런은 5분마다라 평균 0.13회/초다. 그래도 이보다 더 올리지는 말 것 — 차단당하면
--    화면엔 아무 표시가 안 나고 수집만 조용히 멈춘다.
update travel_geo_budget set cap = 8000 where day >= current_date;
alter table travel_geo_budget alter column cap set default 8000;

select cron.unschedule('travel_harvest_places_job')
 where exists (select 1 from cron.job where jobname='travel_harvest_places_job');
select cron.schedule('travel_harvest_places_job', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/harvest-travel-places?n=30',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);

-- 설명·사진·한글화도 같이 따라와야 화면이 안 빈다
select cron.unschedule('travel_summaries_job') where exists (select 1 from cron.job where jobname='travel_summaries_job');
select cron.schedule('travel_summaries_job', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/travel-summaries?n=25',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);

select cron.unschedule('travel_localize_job') where exists (select 1 from cron.job where jobname='travel_localize_job');
select cron.schedule('travel_localize_job', '3,23,43 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/travel-localize?n=20',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
