-- 출처 종류 확장 (2026-08-31)
-- 사장님: "인스타 푸디가 어렵다면 네이버 블로거는 쓸 수 있잖아."
-- 맞다. 디스커버리는 이미 블로그를 훑고 있었지만 '채널명' 축으로만 썼다.
-- 블로그·가이드를 독립 출처로 세운다.
-- ⚠️ 개별 블로거 닉네임은 넣지 않았다 — 확인 없이 적으면 없는 사람을 만든다.
--    사장님이 지목하시면 그때 넣는다. 지금은 검증 가능한 브랜드만.
alter table public.food_channels drop constraint if exists food_channels_kind_check;
alter table public.food_channels add constraint food_channels_kind_check
  check (kind in ('yt','tv','blog','guide'));

insert into public.food_channels (slug, name, kind, yt_query, sort) values
  ('blueribbon', '블루리본서베이', 'guide', '블루리본 맛집',       410),
  ('michelin',   '미쉐린가이드 서울','guide','미쉐린 가이드 서울 맛집', 420),
  ('diningcode', '다이닝코드',     'guide', '다이닝코드 맛집',      430)
on conflict (slug) do nothing;

select kind, count(*) from public.food_channels where active group by kind order by kind;
