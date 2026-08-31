-- 🔖 해시태그 검색 기반 — 광장/이슈/예측 콘텐츠에 tags text[] + GIN 인덱스.
--    글쓰기 폼에서 #해시태그를 tags[]에 저장 → 검색에서 tags @> ARRAY[tag]로 조회(최근/인기순 정렬).
--    issues.tags는 기존 존재. plaza_posts·markets에 추가.
alter table plaza_posts add column if not exists tags text[];
alter table markets     add column if not exists tags text[];

create index if not exists idx_plaza_posts_tags on plaza_posts using gin(tags);
create index if not exists idx_issues_tags      on issues      using gin(tags);
create index if not exists idx_markets_tags      on markets     using gin(tags);
