-- 한국 여행 크리에이터 전면 등록 (2026-09-01)
--
-- 사장님: "우선 크리에이터 확보 우선. 초창기에 준 한국 유명 크리에이터 다 붙여."
--
-- 💰 두 갈래로 붙인다. 순서가 곧 비용이다:
--   ① 공짜  — 핫튜브(youtube_channels)가 이미 해석해둔 travel 피드 채널을 그대로 가져온다.
--             search.list 100유닛을 한 푼도 안 쓴다.
--   ② 유료  — 이름만 아는 채널. 건당 100유닛이라 크론이 하루 몇 개씩만 뚫는다.
--             한 번에 다 켜면 그날 유튜브 쿼터가 통째로 날아가고 핫튜브가 멈춘다.

/* ① 핫튜브에서 가져오기 — 이름을 slug 로 쓸 수 없으니 채널 ID 로 중복을 막는다 */
insert into public.travel_channels (slug, name, kind, yt_channel_id, resolved, active, sort, lang)
select 'yt_' || lower(right(c.channel_id, 12)), c.name, 'yt', c.channel_id, true, true, 70, 'ko'
  from public.youtube_channels c
 where c.feed = 'travel' and c.channel_id is not null
   and not exists (select 1 from public.travel_channels t where t.yt_channel_id = c.channel_id)
on conflict (slug) do nothing;

/* ② 이름만 아는 채널 — 사장님이 준 세 목록(시계탑 블로그·command-f 톱30·여행유튜버 갤러리)과
      톱100에서 아직 안 붙은 한국 채널들. resolved=false 라 크론이 하루 몇 개씩 해석한다.
   ⚠️ 캠핑·차박 전문 채널도 섞여 있다. 여행지 데이터가 나오는지는 수확 수율로 걸러진다
      (쇼츠 필터처럼, 안 나오면 자연히 뒤로 밀린다). 지금은 넓게 잡는다. */
insert into public.travel_channels (slug, name, kind, sort, resolved, active, lang) values
  ('ttoddeonam',    '또떠나는남자',        'yt', 80, false, true, 'ko'),
  ('mindcpr',       '마인드씨피알',        'yt', 81, false, true, 'ko'),
  ('sangga',        '상가의 안녕히살아보기', 'yt', 82, false, true, 'ko'),
  ('ajaetravel',    '아재여행',           'yt', 83, false, true, 'ko'),
  ('parkengek',     '박엥겍',            'yt', 84, false, true, 'ko'),
  ('jojocamping',   '조조캠핑',           'yt', 85, false, true, 'ko'),
  ('ilsangtravel',  '일상이 여행',         'yt', 86, false, true, 'ko'),
  ('kimstravel',    '킴스 트래블',         'yt', 87, false, true, 'ko'),
  ('sjstory',       'SJSTORY',         'yt', 88, false, true, 'ko'),
  ('teddytravel',   '테디여행기',          'yt', 89, false, true, 'ko'),
  ('shinaromi',     '신아로미',           'yt', 90, false, true, 'ko'),
  ('spark_world',   '스팍의 세계일주',      'yt', 91, false, true, 'ko'),
  ('sena_world',    '세나, 집순이의 세계여행','yt', 92, false, true, 'ko'),
  ('garden_world',  '가든의 세계여행',      'yt', 93, false, true, 'ko'),
  ('gogomong',      '고고몽GoGoMong',    'yt', 94, false, true, 'ko'),
  ('yongjincamp',   '세계일주 용진캠프',    'yt', 95, false, true, 'ko'),
  ('woongjin',      '웅진고웨이',          'yt', 96, false, true, 'ko'),
  ('nakang',        '나강 NAkANG',       'yt', 97, false, true, 'ko'),
  ('ajossi',        '아조씨 Ajossi',      'yt', 98, false, true, 'ko'),
  ('bangkokstory',  '방스 BangkokStory',  'yt', 99, false, true, 'ko'),
  ('showddary',     '쑈따리 여행기',       'yt',100, false, true, 'ko'),
  ('yoobeer',       '유맥주 YOOBEER',     'yt',101, false, true, 'ko'),
  ('planb_yeonguk', '연국의 내일',         'yt',102, false, true, 'ko'),
  ('songsup',       '송숲 세계여행',       'yt',103, false, true, 'ko'),
  ('nanajane',      '나나제인',           'yt',104, false, true, 'ko'),
  ('sindywassong',  '한달살러 신디와쏭',    'yt',105, false, true, 'ko'),
  ('birdmoi',       '버드모이',           'yt',106, false, true, 'ko'),
  ('lerico',        '레리꼬',            'yt',107, false, true, 'ko'),
  ('santatv',       '싼타TV',            'yt',108, false, true, 'ko'),
  ('daenggu',       '떠돌이 댕구',         'yt',109, false, true, 'ko'),
  ('jayeobi',       '제여비 JayTravelVid', 'yt',110, false, true, 'ko'),
  ('renee',         '르네 reneetoyou',    'yt',111, false, true, 'ko'),
  ('mwomga',        '여행크리에이터 모험가',  'yt',112, false, true, 'ko'),
  ('mangukyuram',   '만국유람단',          'yt',113, false, true, 'ko'),
  ('sabang',        '여행하는사방',        'yt',114, false, true, 'ko'),
  ('christam',      '크리스땀',           'yt',115, false, true, 'ko'),
  ('jogaem',        '조갬 JOGAEM',        'yt',116, false, true, 'ko'),
  ('salranda',      '살란다',            'yt',117, false, true, 'ko'),
  ('frogout',       '집나간개구리',        'yt',118, false, true, 'ko'),
  ('bombi',         '여행작가 봄비',       'yt',119, false, true, 'ko'),
  ('hwani',         '화니여행',           'yt',120, false, true, 'ko'),
  ('traveljay',     '트래블제이',          'yt',121, false, true, 'ko'),
  ('bcncomma',      '바르셀로나 사는 콤마',  'yt',122, false, true, 'ko'),
  ('doui',          '여행가두이',          'yt',123, false, true, 'ko'),
  ('yoondaein',     '윤대인',            'yt',124, false, true, 'ko'),
  ('taetaego',      '여행가 태태고',       'yt',125, false, true, 'ko'),
  ('changori',      '찬고리 Changori',    'yt',126, false, true, 'ko'),
  ('johnny',        '죠니 Johnny',       'yt',127, false, true, 'ko'),
  ('travelermin',   '배낭여행자 민',       'yt',128, false, true, 'ko'),
  ('charlesalle',   '찰스알레',           'yt',129, false, true, 'ko'),
  ('hglinetravel',  '한결라인 세계여행',    'yt',130, false, true, 'ko'),
  ('badaduck',      '바다덕 badaxduck',   'yt',131, false, true, 'ko'),
  ('duvallo',       '듀발로 세계여행',      'yt',132, false, true, 'ko'),
  ('haesangang',    '해산강 트래블',       'yt',133, false, true, 'ko'),
  ('mireu',         '미르의 여행이야기',    'yt',134, false, true, 'ko'),
  ('jeongssi',      '정씨기행',           'yt',135, false, true, 'ko')
on conflict (slug) do nothing;
