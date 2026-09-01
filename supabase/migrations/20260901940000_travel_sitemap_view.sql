-- 색인 대상 여행지만 추리는 뷰 (2026-09-01)
--
-- 사이트맵에 넣는 주소와 페이지가 실제로 내보내는 robots 태그는 **반드시 같아야** 한다.
-- 어긋나면 서치콘솔에 "제출됐지만 noindex 표시됨" 오류가 그 수만큼 쌓인다.
--
-- 기준(= functions/_middleware.js 의 travelSeo() 안 thin 판정과 같은 규칙):
--   크리에이터 발자국이 하나라도 있거나, 설명이 80자 이상.
-- 둘 다 없는 곳(국가유산 뱃지만 있는 4,390곳)은 사람이 읽을 게 이름뿐이라 thin 이다.
-- 갈라뉴스에서 대량생산으로 걸렸던 것과 같은 실수를 반복하지 않는다. [[galla-seo]]
create or replace view travel_sitemap_v as
  select p.id, p.slug, p.sid, p.name, p.country, p.updated_at, p.created_at
    from travel_places p
   where p.status = 'live'
     and p.slug is not null
     and (exists (select 1 from travel_place_sources s where s.place_id = p.id)
          or length(coalesce(p.summary, '')) >= 80);

grant select on travel_sitemap_v to anon, authenticated;
