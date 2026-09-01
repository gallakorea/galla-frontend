-- 경기도 업무추진비 수집 크론. 서울과 15분 엇갈리게 둔다 —
-- 두 크론이 겹치면 네이버 지역검색을 동시에 때려 일일 한도를 빨리 태운다.
select cron.schedule('gov_expense_gg', '7,37 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/ingest-gov-expense?source=gg&n=300&cap=90',
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
