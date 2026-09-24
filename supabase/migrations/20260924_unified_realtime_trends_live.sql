-- 통합 실시간 트렌드 뷰를 죽은 시드(realtime_keywords, 2026-01-06 박제)에서
-- 살아있는 4대 소스로 교체한다. (26.9.24)
--
-- 진단: 기존 unified_realtime_trends 뷰는 realtime_keywords(1월 시드 5행) + 내부
--       search_logs(최근1h)만 봤다. 정작 갈라가 실시간 수집하는 포털 검색어·뉴스·
--       유튜브·커뮤니티를 하나도 안 물어서 8개월 전 값(아이폰/총선/부동산…)만 떴다.
--
-- 소스 품질(실측): portal_search_trends 의 source 별로
--   google  = 순수 검색어(avg 6자, 조인성·심형래·종합부동산세) ← 최상
--   signal  = 짧은 이슈(avg 11자) ← 양호
--   naver   = 많이 본 '뉴스 헤드라인'(avg 35자) ← 검색어 아님, 오염원 → 축에서 제외
--             (naver 화제는 어차피 news_articles_raw 에 보도로 들어와 있다)
--
-- 설계: google+signal 검색어를 축으로, 순위 역수(21-rank) + 포털 교차수로 기본 점수를
--       주고, 그 키워드가 뉴스/유튜브/커뮤니티 제목에 등장한 횟수를 교차 부스트한다.
--       ⚠️ 검색어(인물·단어) vs 기사제목(사건 서술)의 직접 ILIKE 매칭은 커버리지가
--       낮다(조인성↔"배우 ○○ 논란"). 지금은 검색어 랭킹이 주력이고 교차는 보너스.
--       정밀 교차(시맨틱)는 bge-m3 임베딩으로 후속 고도화.
--
-- 컬럼 계약: 1)keyword 2)total_score 는 기존 순서를 유지(소비자 호환) + 뒤에 진단
--           컬럼 추가. 그래서 CREATE OR REPLACE 로 안전(끝에 추가만 허용).

create or replace view unified_realtime_trends as
with kw as (
  select
    keyword,
    sum(greatest(1, 21 - rank)) as s,        -- 순위 역수 합(1위=20점)
    count(distinct source)      as src,       -- 몇 개 포털에 교차로 떴나
    max(fetched_at)             as seen
  from portal_search_trends
  where fetched_at > now() - interval '50 minutes'   -- 최근 스냅샷(20분 수집 × 여유)
    and source in ('google','signal')                 -- naver 헤드라인 제외
    and char_length(keyword) between 2 and 20         -- 긴 문장(헤드라인) 컷
    and keyword !~ '[a-zA-Z]{3,}'                      -- 외국어 검색어 노이즈 대충 컷
    and keyword not in ('사고','날씨','신뢰도','속보','종합','일본','미국','중국','한국','뉴스')
  group by keyword
)
select
  k.keyword,
  (k.s + k.src * 15 + x.news * 4 + x.yt * 2 + x.comm * 6) as total_score,  -- bigint 유지(기존 뷰 컬럼 타입 호환)
  k.src   as portal_sources,
  x.news  as news_hits,
  x.yt    as youtube_hits,
  x.comm  as community_hits,
  k.seen  as seen_at
from kw k
cross join lateral (
  select
    (select count(*) from news_articles_raw n
       where n.created_at > now() - interval '5 hours'
         and n.title ilike '%' || k.keyword || '%')            as news,
    (select count(*) from youtube_hot y
       where y.collected_at > now() - interval '8 hours'
         and y.title ilike '%' || k.keyword || '%')            as yt,
    (select count(*) from community_hot c
       where c.created_at > now() - interval '24 hours'
         and c.src_title ilike '%' || k.keyword || '%')        as comm
) x
order by total_score desc
limit 40;

-- anon 읽기 (검색어는 사실 정보). 기존 권한이 있어도 재확인.
grant select on unified_realtime_trends to anon, authenticated;
