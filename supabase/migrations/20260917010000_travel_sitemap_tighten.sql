-- 여행 사이트맵 기준 강화 — 얇은 자동 생성 페이지를 대량 제출하면 크롤만 되고 색인이 안 된다.
-- 실측(26.9.17): 사이트맵 8,178건(여행 6,000) 중 색인 3건. 여행지 설명은 300자 넘는 곳이 0곳이고
-- 대부분 80~300자 + 사진 1장이다. 기존 기준은 「출처가 하나라도 있으면 포함」(16,121곳)이라 너무 느슨했다.
-- → 설명 80자 이상 + 사진 있음만 남긴다(4,095곳). 내용이 채워지면 기준을 다시 낮춰 늘린다.
create or replace view public.travel_sitemap_v as
  select id, slug, sid, name, country, updated_at, created_at
    from travel_places p
   where status = 'live'
     and slug is not null
     and coalesce(scale, 'spot') = any (array['spot', 'city'])
     and length(coalesce(summary, '')) >= 80
     and photo is not null;
