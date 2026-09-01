-- 자정 이후 안전하게 재개되도록 크론을 다시 건다. 오늘 사고의 교훈을 숫자로 박는다.
--
-- 오늘: 크론 3개 + 백그라운드 루프 2개가 동시에 때려 25,000 을 다 태웠다.
-- 내일: 장부(하루 20,000)가 1차로 막고, 크론 자체도 그 안에 들어오게 짠다.
--   서울  30분마다 × cap 60 = 최대 2,880
--   경기  30분마다 × cap 60 = 최대 2,880  (서울과 15분 엇갈리게)
--   수확   2시간마다 × 영상 12편 × 최대 3콜 = 최대 432
--   discover 는 호출 한 건씩 장부에서 받아 쓴다(스스로 멈춤)
--   합계 약 6,200 — 한도의 3분의 1이다. 여유를 남기는 게 목적이다.
--
-- ⚠️ 백그라운드 루프는 다시 안 띄운다. 크론과 겹치는 순간 오늘 일이 반복된다.
select cron.schedule('gov_expense_seoul', '5,35 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/ingest-gov-expense?source=seoul&n=300&cap=60',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);

select cron.schedule('gov_expense_gg', '20,50 * * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/ingest-gov-expense?source=gg&n=300&cap=60',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);

-- 메뉴 추출이 여기서 같이 돈다 — 자정 이후 결과를 보고 착한가격업소를 붙일지 정한다.
select cron.schedule('food_harvest_creator', '35 */2 * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/harvest-creator-places?n=12&channel='
           || c.channel,
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000)
  from (
    select v.channel from food_videos v
     where v.harvested_at is null
       and v.description ~ '[가-힣]+(시|군|구)\s*[가-힣0-9]+(로|길)\s*[0-9]'
     group by v.channel order by count(*) desc limit 3
  ) c;
$$);
