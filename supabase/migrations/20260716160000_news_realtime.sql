-- 뉴스 실시간화: ①수집·생성 크론이 pg_net 5s 타임아웃에 걸려 07-15부터 정지 → 타임아웃 상향
--                ②실시간 베스트 hot 산식의 최신 가중 강화(신선 뉴스가 빠르게 상위로 회전)
select cron.schedule('generate_galla_news_job', '*/10 * * * *',
  $$ select net.http_post(url:='https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/generate-galla-news',
     headers:=jsonb_build_object('Content-Type','application/json'),
     body:='{"max_topics":10,"hours":6}'::jsonb, timeout_milliseconds:=90000); $$);
select cron.schedule('collect_rss_news_job', '*/10 * * * *',
  $$ select net.http_post(url:='https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/collect-rss-news',
     headers:=jsonb_build_object('Content-Type','application/json'),
     body:='{}'::jsonb, timeout_milliseconds:=60000); $$);
select cron.schedule('collect_raw_news_job', '*/5 * * * *',
  $$ select net.http_post(url:='https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/collect-raw-news',
     headers:=jsonb_build_object('Content-Type','application/json'),
     body:='{}'::jsonb, timeout_milliseconds:=30000); $$);
-- galla_news_home hot 산식: 최신 가중 12h×0.8 → 18h×1.6 (본문은 20260716160001에 전체 재정의)
