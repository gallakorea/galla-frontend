-- 착한가격 남은 곳을 NCP 지오코딩으로 마저 세운다.
--
-- 네이버 지역검색(상호로 찾기)이 못 찾던 2,147곳은 데이터가 나빠서가 아니라 도구가 틀렸다.
-- 주소 지오코딩으로 바꾸니 정확도가 차원이 다르다(실측 15곳 대조):
--     Nominatim   13/15 찾음 · 오차 중앙값 293m · 최악 6.2km
--     NCP         15/15 찾음 · 오차 중앙값 **5m** · 전부 100m 이내
-- 무료 한도 하루 300만 건이라 남은 물량은 티도 안 난다.
--
-- 15분마다 250곳 = 시간당 1,000곳. 남은 1,402곳이면 2시간이면 끝난다.
-- 다 세우면 대상이 비어 호출이 0이 된다 — 끄지 않아도 된다.
select cron.schedule('good_price_geocode', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/geocode-good-price?n=250',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);

-- 네이버 지역검색 재시도는 이제 필요 없다 — 지오코딩이 상위 호환이다(상호 무관·정확·한도 큼).
select cron.unschedule('good_price_resolve');
