-- 🔎 검색 고도화 Phase 2(26.9.23) — 맛집·여행·뉴스로 확장
-- 원칙: 트라이그램은 전량(비용 0, 즉시 퍼지 매칭), 벡터 임베딩은 가치 높은 것부터 크론으로 채움(bge-m3 무료한도 배려).
create extension if not exists pg_trgm;

alter table public.food_places   add column if not exists search_vec vector(1536);
alter table public.travel_places add column if not exists search_vec vector(1536);
alter table public.galla_news    add column if not exists search_vec vector(1536);

-- 트라이그램(전량·즉시): 이름·분류·주소/도시. 임베딩 없어도 「분식 맛집」「교토 여행」 퍼지 매칭이 ILIKE보다 강하다.
create index if not exists food_name_trgm  on public.food_places   using gin ((coalesce(name,'')||' '||coalesce(category,'')) gin_trgm_ops) where status='live';
create index if not exists food_addr_trgm  on public.food_places   using gin (address gin_trgm_ops) where status='live';
create index if not exists travel_name_trgm on public.travel_places using gin ((coalesce(name,'')||' '||coalesce(city,'')||' '||coalesce(country,'')) gin_trgm_ops);
create index if not exists news_title_trgm on public.galla_news    using gin (title gin_trgm_ops) where status='published';
create index if not exists food_vec_idx    on public.food_places   using ivfflat (search_vec vector_cosine_ops) with (lists=100) where search_vec is not null;
create index if not exists travel_vec_idx  on public.travel_places using ivfflat (search_vec vector_cosine_ops) with (lists=100) where search_vec is not null;
create index if not exists news_vec_idx     on public.galla_news    using ivfflat (search_vec vector_cosine_ops) with (lists=100) where search_vec is not null;

-- galla_search 확장: issue·plaza·food·travel·news. 벡터 있으면 의미+키워드, 없으면 키워드만(점진 degrade).
create or replace function public.galla_search(
  p_query_text text,
  p_query_vec  vector(1536) default null,
  p_sections   text[] default array['issue','plaza'],
  p_limit      int default 6
) returns table(section text, id text, title text, sub text, score real)
language sql stable security definer set search_path=public as $$
  with qt as (select coalesce(nullif(trim(p_query_text),''),'') q)
  select * from (
    select 'issue' section, i.id::text, i.title, coalesce(i.one_line,'')::text sub,
           (0.6*coalesce(case when p_query_vec is not null and i.search_vec is not null then 1-(i.search_vec <=> p_query_vec) else 0 end,0)
            + 0.4*similarity(i.title,(select q from qt)))::real score
    from issues i where 'issue'=any(p_sections) and i.status='normal'
      and ((select q from qt)='' or i.title % (select q from qt) or i.title ilike '%'||(select q from qt)||'%' or (p_query_vec is not null and i.search_vec is not null))
    union all
    select 'plaza', p.id::text, p.title, coalesce(p.category,'')::text,
           (0.6*coalesce(case when p_query_vec is not null and p.search_vec is not null then 1-(p.search_vec <=> p_query_vec) else 0 end,0)
            + 0.4*similarity(coalesce(p.title,''),(select q from qt)))::real
    from plaza_posts p where 'plaza'=any(p_sections)
      and ((select q from qt)='' or coalesce(p.title,'') % (select q from qt) or coalesce(p.title,'') ilike '%'||(select q from qt)||'%' or (p_query_vec is not null and p.search_vec is not null))
    union all
    select 'food', f.id::text, f.name, (coalesce(f.category,'')||' '||coalesce(f.address,''))::text,
           (0.55*coalesce(case when p_query_vec is not null and f.search_vec is not null then 1-(f.search_vec <=> p_query_vec) else 0 end,0)
            + 0.45*similarity(coalesce(f.name,'')||' '||coalesce(f.category,''),(select q from qt)))::real
    from food_places f where 'food'=any(p_sections) and f.status='live'
      and ((coalesce(f.name,'')||' '||coalesce(f.category,'')) % (select q from qt) or f.address ilike '%'||(select q from qt)||'%')
    union all
    select 'travel', t.id::text, t.name, (coalesce(t.country,'')||' '||coalesce(t.city,''))::text,
           (0.55*coalesce(case when p_query_vec is not null and t.search_vec is not null then 1-(t.search_vec <=> p_query_vec) else 0 end,0)
            + 0.45*similarity(coalesce(t.name,'')||' '||coalesce(t.city,'')||' '||coalesce(t.country,''),(select q from qt)))::real
    from travel_places t where 'travel'=any(p_sections)
      and ((coalesce(t.name,'')||' '||coalesce(t.city,'')||' '||coalesce(t.country,'')) % (select q from qt))
    union all
    select 'news', n.id::text, n.title, coalesce(n.summary,'')::text,
           (0.6*coalesce(case when p_query_vec is not null and n.search_vec is not null then 1-(n.search_vec <=> p_query_vec) else 0 end,0)
            + 0.4*similarity(n.title,(select q from qt)))::real
    from galla_news n where 'news'=any(p_sections) and n.status='published'
      and (n.title % (select q from qt) or n.title ilike '%'||(select q from qt)||'%' or (p_query_vec is not null and n.search_vec is not null))
  ) u
  where u.score > 0.02
  order by u.score desc
  limit greatest(1, least(p_limit, 20));
$$;
revoke execute on function public.galla_search(text,vector,text[],int) from anon;
grant execute on function public.galla_search(text,vector,text[],int) to service_role, authenticated;
