-- 채널 대폭 확장 (2026-08-31)
-- 김사원세끼 1개 채널 = 61건. 수율은 "상호를 제목·설명에 박는 채널이냐"로 갈린다.
-- 어느 채널이 되는지는 미리 못 안다 → 넓게 걸고 **수율 데이터로 정리**한다.
-- 안 되는 채널의 비용은 playlistItems 1유닛뿐이라 실험이 싸다.
insert into public.food_channels (slug, name, kind, yt_query, sort) values
  ('heebab',      '히밥',           'yt', '히밥',                 110),
  ('ipjjalb',     '입짧은햇님',      'yt', '입짧은햇님',           120),
  ('jeongyukwang','정육왕',         'yt', '정육왕',               130),
  ('massangmu',   '맛상무',         'yt', '맛상무 맛집',          140),
  ('yasigi',      '야식이',         'yt', '야식이 먹방',          150),
  ('nadomi',      '나도미식가',      'yt', '나도미식가',           160),
  ('chuder',      '츄더',           'yt', '츄더 먹방',            170),
  ('meokbosa',    '먹보스쭈엥',      'yt', '먹보스 쭈엥',          180),
  ('hongyu',      '홍유',           'yt', '홍유 먹방',            190),
  ('ddorine',     '또리네가족',      'yt', '또리네가족',           200),
  ('golmok',      '골목식당',        'tv', '백종원 골목식당',      210),
  ('sikgaek',     '식객 허영만',     'tv', '식객 허영만 맛집',     220)
on conflict (slug) do nothing;

update public.food_channels set yt_title_re = '골목식당'  where slug='golmok';
update public.food_channels set yt_title_re = '식객'      where slug='sikgaek';

select count(*) filter (where active) as 활성채널 from public.food_channels;
