-- 🔎 갈비스 검색 고도화 Phase 1(26.9.23) — 키워드 ILIKE → 하이브리드(의미 벡터 + 트라이그램)
-- 이슈·광장부터(작음·안전). 맛집·여행·뉴스는 Phase 2에서 같은 패턴으로 확장.
create extension if not exists pg_trgm;
create extension if not exists vector;

-- 의미 벡터(bge-m3 1536차원, friend_memory와 동일). 콘텐츠 생성/수정 시 백필로 채운다(질의당 아님).
alter table public.issues       add column if not exists search_vec vector(1536);
alter table public.plaza_posts  add column if not exists search_vec vector(1536);

-- 트라이그램(한국어 부분·오타 매칭 — tsvector 한국어 사전 없이도 강함), 벡터 근사 인덱스
create index if not exists issues_title_trgm on public.issues using gin (title gin_trgm_ops) where status='normal';
create index if not exists plaza_title_trgm  on public.plaza_posts using gin (title gin_trgm_ops);
create index if not exists issues_vec_idx  on public.issues      using ivfflat (search_vec vector_cosine_ops) with (lists=50) where search_vec is not null;
create index if not exists plaza_vec_idx   on public.plaza_posts using ivfflat (search_vec vector_cosine_ops) with (lists=50) where search_vec is not null;

-- 🔀 하이브리드 검색: 벡터 유사도(의미) + 트라이그램(키워드)을 가중 합산. 벡터 없는 행은 키워드만(점진 degrade).
--    service_role/authenticated/anon 모두 읽기용(콘텐츠는 공개). 지어내기 방지: 실제 행만 반환.
create or replace function public.galla_search(
  p_query_text text,
  p_query_vec  vector(1536) default null,
  p_sections   text[] default array['issue','plaza'],
  p_limit      int default 6
) returns table(section text, id text, title text, sub text, score real)
language sql stable security definer set search_path=public as $$
  with qt as (select coalesce(nullif(trim(p_query_text),''),'') q)
  select * from (
    select 'issue' section, i.id::text, i.title,
           (coalesce(i.one_line,'') )::text sub,
           (0.6*coalesce(case when p_query_vec is not null and i.search_vec is not null
                              then 1-(i.search_vec <=> p_query_vec) else 0 end,0)
            + 0.4*similarity(i.title, (select q from qt)))::real score
    from issues i where 'issue'=any(p_sections) and i.status='normal'
      and ( (select q from qt)='' or i.title % (select q from qt) or i.title ilike '%'||(select q from qt)||'%'
            or (p_query_vec is not null and i.search_vec is not null) )
    union all
    select 'plaza' section, p.id::text, p.title,
           (coalesce(p.category,''))::text sub,
           (0.6*coalesce(case when p_query_vec is not null and p.search_vec is not null
                              then 1-(p.search_vec <=> p_query_vec) else 0 end,0)
            + 0.4*similarity(coalesce(p.title,''), (select q from qt)))::real score
    from plaza_posts p where 'plaza'=any(p_sections)
      and ( (select q from qt)='' or coalesce(p.title,'') % (select q from qt) or coalesce(p.title,'') ilike '%'||(select q from qt)||'%'
            or (p_query_vec is not null and p.search_vec is not null) )
  ) u
  where u.score > 0.02
  order by u.score desc
  limit greatest(1, least(p_limit, 20));
$$;
revoke execute on function public.galla_search(text,vector,text[],int) from anon;
grant execute on function public.galla_search(text,vector,text[],int) to service_role, authenticated;
