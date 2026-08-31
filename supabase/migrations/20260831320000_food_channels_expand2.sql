-- 채널 대폭 확장 (2026-08-31)
-- 디스커버리는 채널 '이름'만으로 네이버 블로그·뉴스를 훑으므로 유튜브 채널 ID가 없어도 채워진다.
-- yt_channel_id 는 수집기(유튜브 경로)가 나중에 스스로 확정한다.
insert into public.food_channels (slug, name, kind, yt_query, sort) values
  -- 사장님이 지목한 것들
  ('bimirya',     '비밀이야',        'tv', '비밀이야 맛집',        230),
  ('gongtam',     '공간탐닉',        'yt', '공간탐닉',            240),
  ('baengnyeon',  '백년가게',        'tv', '백년가게',            250),
  ('ganjeol',     '간절한입',        'yt', '간절한입',            260),
  ('tzuyangmeot', '쯔양 몇끼',       'yt', '쯔양 몇끼',           270),
  -- 맛집 탐방 프로그램·크리에이터 확장
  ('choijaroad',  '최자로드',        'tv', '최자로드 맛집',        280),
  ('sungsikyung', '성시경',          'yt', '성시경 먹을텐데',      290),
  ('baekjongwon', '백종원',          'yt', '백종원 맛집',          300),
  ('kwaktube',    '곽튜브',          'yt', '곽튜브 맛집',          310),
  ('yuksikman',   '육식맨',          'yt', '육식맨',              320),
  ('seungwoodad', '승우아빠',        'yt', '승우아빠',            330),
  ('moonbokhee',  '문복희',          'yt', '문복희 먹방',          340),
  ('ddeonggae',   '떵개떵',          'yt', '떵개떵',              350),
  ('sanghaegi',   '상해기',          'yt', '상해기 먹방',          360),
  ('nareum',      '나름',            'yt', '나름 먹방',           370),
  ('soyou',       '소유',            'yt', '소유 먹방',           380),
  ('busanchon',   '부산촌놈',        'yt', '부산촌놈 맛집',        390),
  ('pungja',      '풍자',            'yt', '풍자 맛집',           400)
on conflict (slug) do nothing;

update public.food_channels set yt_title_re = '비밀이야'   where slug='bimirya';
update public.food_channels set yt_title_re = '백년가게'   where slug='baengnyeon';
update public.food_channels set yt_title_re = '최자로드'   where slug='choijaroad';

select count(*) filter (where active) as 활성채널 from public.food_channels;
