-- =========================================================
-- 카테고리별 갈라뉴스 섹션 피드 (실시간 베스트/많이 본/댓글 많은/실시간)
-- =========================================================
create or replace function public.galla_news_category(p_cat text)
returns jsonb
language sql stable security definer set search_path = public as $$
with base as (
  select n.id, n.title, n.category, n.hero_image, n.published_at,
         coalesce(n.source_count,0) source_count, n.view_count
  from galla_news n
  where n.status = 'published' and n.category = p_cat
    and n.hero_image is not null and n.hero_image <> ''
    and n.published_at > now() - interval '7 days'
),
agg as (
  select b.*,
         coalesce(c.cnt,0) c_count,
         coalesce(r.likes,0) likes, coalesce(r.dislikes,0) dislikes
  from base b
  left join (select news_id, count(*) cnt from galla_news_comments group by news_id) c on c.news_id = b.id
  left join (select news_id, count(*) filter(where value=1) likes, count(*) filter(where value=-1) dislikes
             from galla_news_reactions group by news_id) r on r.news_id = b.id
),
scored as (
  select *,
    (likes + c_count*3 + dislikes) + source_count*0.6
    + greatest(0, 12 - extract(epoch from (now()-published_at))/3600)*0.8 as hot
  from agg
),
row_j as (
  select id, jsonb_build_object(
    'id',id,'title',title,'category',category,'hero_image',hero_image,
    'published_at',published_at,'source_count',source_count,
    'view_count',view_count,'cCount',c_count,'likes',likes,'dislikes',dislikes
  ) j, published_at, view_count, c_count, hot
  from scored
)
select jsonb_build_object(
  'best', (select coalesce(jsonb_agg(j order by hot desc),'[]'::jsonb)
           from (select j,hot from row_j order by hot desc limit 10) t),
  'mostViewed', (select coalesce(jsonb_agg(j order by view_count desc),'[]'::jsonb)
                 from (select j,view_count from row_j where view_count>0 order by view_count desc limit 10) t),
  'mostCommented', (select coalesce(jsonb_agg(j order by c_count desc),'[]'::jsonb)
                    from (select j,c_count from row_j where c_count>0 order by c_count desc limit 10) t),
  'latest', (select coalesce(jsonb_agg(j order by published_at desc),'[]'::jsonb)
             from (select j,published_at from row_j order by published_at desc limit 30) t),
  'total', (select count(*) from base)
);
$$;
grant execute on function public.galla_news_category(text) to anon, authenticated;
