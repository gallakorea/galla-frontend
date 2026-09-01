-- 착한가격업소: 주 1회 원본 갱신, 매일 잇기.
--
-- 원본은 분기 갱신(다음 등록 2026-10-30)이라 매일 12,645행을 다시 긁을 이유가 없다.
-- 반면 **잇기는 매일 돌려야** 한다 — 가게가 늘 때마다 그동안 못 이었던 행이 붙기 때문이다.
-- 잇기는 외부 호출이 0이라 몇 번을 돌려도 비용이 없다.
select cron.schedule('good_price_pull', '50 4 * * 1', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/ingest-good-price?pages=30&per=500',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);

select cron.schedule('good_price_link', '20 5 * * *', $$
  select food_goodprice_link(4000);
$$);
