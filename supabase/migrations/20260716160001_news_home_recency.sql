CREATE OR REPLACE FUNCTION public.galla_news_home()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with base as (
  select n.id, n.title, n.category, n.hero_image, n.published_at,
         coalesce(n.source_count,0) source_count, n.view_count
  from galla_news n
  where n.status = 'published'
    and n.hero_image is not null and n.hero_image <> ''
    and n.published_at > now() - interval '3 days'
),
agg as (
  select b.*,
         coalesce(c.cnt,0) c_count,
         coalesce(r.likes,0) likes,
         coalesce(r.dislikes,0) dislikes
  from base b
  left join (
    select news_id, count(*) cnt from galla_news_comments group by news_id
  ) c on c.news_id = b.id
  left join (
    select news_id,
           count(*) filter (where value = 1)  likes,
           count(*) filter (where value = -1) dislikes
    from galla_news_reactions group by news_id
  ) r on r.news_id = b.id
),
scored as (
  -- 실시간 베스트 점수: 참여(좋아요+댓글*3+시간가중) + 보도량(source_count).
  -- 참여가 아직 적어 초반엔 source_count·최신순이 주도한다(합리적 '지금 뜨는' 대용).
  select *,
    (likes + c_count*3 + dislikes)                                           -- 참여(좋아요·댓글가중)
    + source_count * 0.5                                                      -- 보도량(큰 사건)
    + greatest(0, 18 - extract(epoch from (now()-published_at))/3600) * 1.6   -- 18h 이내 최신 강가산(신선 뉴스가 빠르게 상위로 회전)
    as hot
  from agg
),
row_j as (  -- 카드 1개를 json으로
  select id, jsonb_build_object(
    'id', id, 'title', title, 'category', category, 'hero_image', hero_image,
    'published_at', published_at, 'source_count', source_count,
    'view_count', view_count, 'cCount', c_count, 'likes', likes, 'dislikes', dislikes
  ) j, category, published_at, view_count, c_count, hot, source_count
  from scored
)
select jsonb_build_object(
  -- 속보: 최신 발행 스트립
  'breaking', (select coalesce(jsonb_agg(j order by published_at desc),'[]'::jsonb)
               from (select j, published_at from row_j order by published_at desc limit 10) t),
  -- 실시간 베스트: hot 상위
  'best', (select coalesce(jsonb_agg(j order by hot desc),'[]'::jsonb)
           from (select j, hot from row_j order by hot desc limit 10) t),
  -- 주요 뉴스: 보도 언론사 많은 순(=큰 사건)
  'major', (select coalesce(jsonb_agg(j order by source_count desc),'[]'::jsonb)
            from (select j, source_count from row_j order by source_count desc, published_at desc limit 6) t),
  -- 많이 본
  'mostViewed', (select coalesce(jsonb_agg(j order by view_count desc),'[]'::jsonb)
                 from (select j, view_count from row_j where view_count>0 order by view_count desc limit 10) t),
  -- 댓글 많은
  'mostCommented', (select coalesce(jsonb_agg(j order by c_count desc),'[]'::jsonb)
                    from (select j, c_count from row_j where c_count>0 order by c_count desc limit 10) t),
  -- 카테고리별 최신
  'byCategory', (
    select coalesce(jsonb_object_agg(category, arr),'{}'::jsonb) from (
      select category, jsonb_agg(j order by published_at desc) arr from (
        select category, j, published_at,
               row_number() over (partition by category order by published_at desc) rn
        from row_j
      ) x where rn <= 8 group by category
    ) y
  )
);
$function$

