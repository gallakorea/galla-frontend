-- 인증 장소의 한국어 국가명 채우기 + 크론 (2026-09-01)
-- 인증 적재는 country_code 만 넣는다(SPARQL 이 ISO 코드만 준다).
-- 한국어 국가명은 우리가 이미 가진 행에서 빌려 온다 — 외부 호출이 필요 없다.
update travel_places p set country = m.nm
  from (select country_code, min(country) nm from travel_places
         where country is not null and country ~ '[가-힣]' group by country_code) m
 where p.country is null and p.country_code = m.country_code;

select cron.unschedule('travel_certs_job') where exists (select 1 from cron.job where jobname='travel_certs_job');
select cron.schedule('travel_certs_job', '25 */6 * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/ingest-travel-certs?n=200&offset=0',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
