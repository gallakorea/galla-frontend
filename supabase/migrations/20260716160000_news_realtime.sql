-- 뉴스 실시간화 — 07-15부터 정지한 원인 2가지 동시 수정:
--  ① pg_net 5s 타임아웃 < 함수 실행시간(generate ~13s, rss 5.5s) → 연결끊김·중단
--  ② 플랫폼이 verify_jwt=false 함수에도 anon apikey Authorization 요구 → 401
-- 해결: 타임아웃 상향 + anon Bearer 헤더 추가.
select cron.schedule('generate_galla_news_job', '*/10 * * * *',
  $$ select net.http_post(url:='https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/generate-galla-news',
     headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM'),
     body:='{"max_topics":10,"hours":6}'::jsonb, timeout_milliseconds:=90000); $$);
select cron.schedule('collect_rss_news_job', '*/10 * * * *',
  $$ select net.http_post(url:='https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/collect-rss-news',
     headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM'),
     body:='{}'::jsonb, timeout_milliseconds:=60000); $$);
select cron.schedule('collect_raw_news_job', '*/5 * * * *',
  $$ select net.http_post(url:='https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/collect-raw-news',
     headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM'),
     body:='{}'::jsonb, timeout_milliseconds:=30000); $$);
