-- 뉴스 수집 다변화: 기존 collect-raw-news(네이버 검색 API 단일 의존)의 대안/보강.
-- collect-rss-news 엣지 함수가 한국 언론사 RSS를 병렬 수집(키/쿼터 없음, 네이버 막혀도 유입 지속).
-- news_articles_raw 에 source='rss' 로 upsert(onConflict url ignore). 관리 API로 이미 적용, 기록용.

-- select cron.schedule('collect_rss_news_job','*/10 * * * *',
--   $$ select net.http_post(url:='.../functions/v1/collect-rss-news',
--        headers:=jsonb_build_object('Content-Type','application/json'),
--        body:='{}'::jsonb); $$);

-- 수집 피드(살아있는 것 확인): 연합뉴스(news/politics/economy/international), 경향, 한겨레,
-- 머니투데이, 전자신문, 오마이뉴스, SBS, 국민일보. 1회 ~344건 fetch / ~325 신규.
-- 다운스트림(categorize sid, group_related_news, thumbnail 채우기)은 source 무관하게 processed=false 처리.
