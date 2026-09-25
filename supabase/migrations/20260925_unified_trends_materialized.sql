-- 통합 트렌드 뷰를 materialized view로 전환 (26.9.25 먹통 수정)
-- 원인: 검색어 40개 × (galla_news title+summary / news_raw / youtube / community) ILIKE
--   풀스캔이라 anon(프론트) statement timeout(57014, HTTP500) → 실시간 급상승 먹통.
-- 해결: materialized view로 무거운 계산을 10분 크론에 미리 하고, 프론트 조회는 즉시(200).
--   concurrently refresh 위해 keyword unique index. 프론트는 order by total_score 명시.

drop view if exists unified_realtime_trends;
create materialized view unified_realtime_trends as
with kw as (
  select keyword, sum(greatest(1,21-rank)) as s, count(distinct source) as src, max(fetched_at) as seen
  from portal_search_trends
  where fetched_at > now() - interval '50 minutes'
    and source in ('google','signal')
    and char_length(keyword) between 2 and 20
    and keyword !~ '[a-zA-Z]{3,}'
    and keyword not in ('사고','날씨','신뢰도','속보','종합','일본','미국','중국','한국','뉴스')
  group by keyword
)
select k.keyword,
  (k.s + k.src*10 + x.news*3 + x.comm*5 + case when x.gn_id is not null then 45 else 0 end) as total_score,
  k.src as portal_sources, x.news as news_hits, x.yt as youtube_hits, x.comm as community_hits,
  k.seen as seen_at, x.gn_id
from kw k
cross join lateral (
  select
    (select count(*) from news_articles_raw n where n.created_at>now()-interval '5 hours' and n.title ilike '%'||k.keyword||'%') as news,
    (select count(*) from youtube_hot y where y.collected_at>now()-interval '8 hours' and y.title ilike '%'||k.keyword||'%') as yt,
    (select count(*) from community_hot c where c.created_at>now()-interval '24 hours' and c.src_title ilike '%'||k.keyword||'%') as comm,
    (select g.id from galla_news g where g.status='published' and g.published_at>now()-interval '3 days'
       and (g.title ilike '%'||k.keyword||'%' or g.summary ilike '%'||k.keyword||'%')
       order by g.published_at desc limit 1) as gn_id
) x
order by total_score desc
limit 40;
create unique index on unified_realtime_trends (keyword);
grant select on unified_realtime_trends to anon, authenticated;
select cron.unschedule('refresh_unified_trends') where exists (select 1 from cron.job where jobname='refresh_unified_trends');
select cron.schedule('refresh_unified_trends','*/10 * * * *',$$refresh materialized view concurrently unified_realtime_trends$$);
