-- 서치 페이지 실시간 뉴스 쿼리가 타임아웃(57014)나던 문제 해결.
-- news_articles_raw(약 38만행)에 published_at 인덱스가 없어 매 조회마다
-- Parallel Seq Scan + Sort 로 statement_timeout 을 초과했음.
--
-- 프론트 쿼리: where published_at >= now()-'24h' order by published_at desc, id desc
--            + 카테고리 필터 시 where sid = ? 추가
--
-- 관리 API로 이미 적용함(CONCURRENTLY). 이 파일은 기록용.

create index concurrently if not exists idx_news_pub_id
  on public.news_articles_raw (published_at desc, id desc);

create index concurrently if not exists idx_news_sid_pub
  on public.news_articles_raw (sid, published_at desc);
