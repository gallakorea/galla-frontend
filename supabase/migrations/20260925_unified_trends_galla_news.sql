-- 통합 실시간 트렌드 v3 (26.9.25): 갈라뉴스 연결 + 유튜브 노이즈 제외
-- 심형래 1위 사고 진단: 검색어(인물)↔기사(사건) 글자 불일치로 뉴스 교차가 무력 →
--   포털 검색어가 날것으로 노출됐다. 근본 원인은 galla_news 생성 중단(9/23~,
--   DeepSeek 잔액 소진 의심)이라 gn 연결이 전부 0. 충전으로 갈라뉴스 재개되면
--   gn_id 매칭(+45)이 살아나 갈라 콘텐츠 있는 화제가 상위로, 클릭 시 그 뉴스로 간다.
-- ⚠️ 유튜브 기여는 순위에서 제외(옛날 짤 편향, YouTube ToS 파생지표도 회피).

create or replace view unified_realtime_trends as
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
select
  k.keyword,
  (k.s + k.src*10 + x.news*3 + x.comm*5 + case when x.gn_id is not null then 45 else 0 end) as total_score,
  k.src as portal_sources,
  x.news as news_hits,
  x.yt as youtube_hits,
  x.comm as community_hits,
  k.seen as seen_at,
  x.gn_id
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
grant select on unified_realtime_trends to anon, authenticated;
