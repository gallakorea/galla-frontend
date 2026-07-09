-- 통합 검색 고도화: 뉴스 제목 부분검색(ILIKE '%kw%')용 트라이그램 인덱스.
-- 38만 행 news_articles_raw 를 인덱스 없이 부분검색하면 타임아웃 위험.
-- 관리 API로 이미 적용함(CONCURRENTLY). 기록용.

create extension if not exists pg_trgm;

create index concurrently if not exists idx_news_title_trgm
  on public.news_articles_raw using gin (title gin_trgm_ops);
