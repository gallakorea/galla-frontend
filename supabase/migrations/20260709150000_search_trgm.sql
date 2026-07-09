-- 통합 검색 고도화: 뉴스 제목 부분검색(ILIKE '%kw%')용 트라이그램 인덱스.
-- 38만 행 news_articles_raw 를 인덱스 없이 부분검색하면 타임아웃 위험.
-- 관리 API로 이미 적용함(CONCURRENTLY). 기록용.

create extension if not exists pg_trgm;

create index concurrently if not exists idx_news_title_trgm
  on public.news_articles_raw using gin (title gin_trgm_ops);

-- 관련기사 묶음 모달: where related_group_id = X 조회가 인덱스 없어 타임아웃나던 문제.
-- 대부분 null 이므로 부분 인덱스.
create index concurrently if not exists idx_news_related_group
  on public.news_articles_raw (related_group_id) where related_group_id is not null;
