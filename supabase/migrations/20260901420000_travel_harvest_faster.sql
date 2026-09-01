-- 수확 속도 상향 (2026-09-01) — 사장님 승인
--
-- 적재된 영상 2,000편을 소화하는 게 목표다. 병목은 LLM 이 아니라 지오코딩 장부였다.
--   전: 20분마다 6편 = 하루 432편, 장부 1,500 → 하루 약 700곳이 천장
--   후: 15분마다 6편 = 하루 576편, 장부 3,000 → 이틀이면 초기 적재가 끝난다
--
-- ⚠️ 장부를 올려도 **호출 간격 1.1초는 그대로**다. Nominatim 정책의 핵심은 총량이 아니라
--    초당 1회이고, 그걸 어기면 IP 가 막힌다. 막혀도 화면엔 아무 표시가 안 나고
--    수집만 조용히 멈춘다 — 맛집에서 이 패턴으로 9,086곳을 날린 적이 있다.
-- ⚠️ 주기를 이보다 더 당기지 말 것. 엣지 유휴 150초라 회차가 겹치기 시작하면
--    실행이 통째로 날아가는데 pg_cron 이력엔 'succeeded' 로 남는다.
update travel_geo_budget set cap = 3000 where day >= current_date;
alter table travel_geo_budget alter column cap set default 3000;

select cron.unschedule('travel_harvest_places_job')
 where exists (select 1 from cron.job where jobname='travel_harvest_places_job');
select cron.schedule('travel_harvest_places_job', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/harvest-travel-places?n=6',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 140000);
$$);
