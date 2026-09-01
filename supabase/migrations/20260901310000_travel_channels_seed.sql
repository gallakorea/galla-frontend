-- 여행 크리에이터 시드 (2026-09-01)
--
-- 사장님이 준 세 목록을 합쳤다: 시계탑 블로그(2025-03 순위), command-f(2025-09 톱30),
-- 여행유튜버 갤러리 투표(디시). 앞 둘은 순위가, 마지막은 '실제로 보는 사람들의 선호'가 다르다.
-- 셋을 합집합으로 넣되, **채널 ID가 공개 링크로 이미 확인된 것만 active** 로 켠다.
--
-- 💰 이 파일의 핵심은 UC… 를 박아두는 것이다.
--    search.list 로 채널명을 해석하면 건당 100유닛이다. 31개면 3,100유닛 —
--    핫튜브·맛집이 이미 하루 6~7천을 쓰는 판에 그건 수집을 하루 멈추는 값이다.
--    링크가 공개된 채널은 UC 를 그대로 넣어 그 비용을 0으로 만든다.
--    이름만 있는 채널은 resolved=false 로 남겨두고 수집기가 회차당 1개씩만 해석한다.
--
-- ⚠️ 여기 이름은 '시드 시점의 표기'다. 채널명이 바뀌어도 slug 는 안 바꾼다(출처 연결이 끊긴다).

insert into public.travel_channels (slug, name, kind, yt_channel_id, subs, sort, resolved, active) values
  ('panibottle',   '빠니보틀 Pani Bottle',        'yt', 'UCNhofiqfw5nl-NeDJkXtPvw', 2510000,  1, true, true),
  ('kwaktube',     '곽튜브',                      'yt', 'UClRNDVO8093rmRTtLe4GEPw', 2130000,  2, true, true),
  ('heechulism',   '희철리즘 Heechulism',         'yt', 'UCwjMQYL9vgbqGzxYW6dVhTw', 1160000,  3, true, true),
  ('onziday',      '원지의 하루',                 'yt', 'UC9gxOp_-R78phMHmv2bW_sg', 1020000,  4, true, true),
  ('seojaero36',   '서재로36',                    'yt', null,                        785000,  5, false, true),
  ('travelerjay',  '여행가 제이',                 'yt', 'UCxU8QX7IRRIW0VLuoWWoxbw',  781000,  6, true, true),
  ('nomadshaun',   '노마드션 No mad Shaun',       'yt', 'UCfCOEG2kjX_x4KAdWX-YUcA',  762000,  7, true, true),
  ('chomad',       '초마드 CHOMAD',               'yt', 'UCvuwlY4fWkWMuzRkj5MAK9Q',  757000,  8, true, true),
  ('koreanjay',    '채코제 Channel Korean Jay',   'yt', 'UCaoqDZPllYXLAH_5OBRLLrw',  751000,  9, true, true),
  ('soytheworld',  '쏘이 Soy The World',          'yt', 'UCugz3-UlkX2P77PtK1Ju0RA',  671000, 10, true, true),
  ('captainbro',   '캡틴따거 Captain Brother',    'yt', 'UCt_7uH4Igz0T_K3Qzbs1Wig',  676000, 11, true, true),
  ('kkujun',       '꾸준 kkujun',                 'yt', 'UCxgeEPgtd5Aw7HgoEUXCauA',  661000, 12, true, true),
  ('trankilo',     '뜨랑낄로 Trankilo',           'yt', 'UCWqWR1sFAz9UsjwkFHEkBsw',  510000, 13, true, true),
  ('yeorak',       '여락이들',                    'yt', 'UCgDlijNPh7yHQNv0YdL11fQ',  558000, 14, true, true),
  ('valleyfrog',   '계곡은 개골개골',             'yt', 'UCxjRJr-F5R5UxZZfoLd2NDQ',  488000, 15, true, true),
  ('honggogo',     '홍고고 HONGGOGO',             'yt', 'UCtupKg-bVtyq2oWNQnLLCeA',  464000, 16, true, true),
  ('carrotman',    '캐럿맨 여행기',               'yt', 'UC_4hHKHUcs9bGpl_zDAOxvg',  437000, 17, true, true),
  ('brucelee_tv',  '브루스리 TV',                 'yt', 'UCNAdXHkMg3U4xmrU9eyg1Ww',  424000, 18, true, true),
  ('yozigyeong',   '세계는요지경',                'yt', 'UC3xY1G6vk1UHUneP-IIhhcg',  391000, 19, true, true),
  ('mochilero',    '모칠레로 Mochilero',          'yt', 'UCUcy82tGagXlj4t1p2todeQ',  367000, 20, true, true),
  ('doongsis',     '둥지언니 Doongsis',           'yt', 'UCGznJ6xII2H4BIXEclV9QEg',  357000, 21, true, true),
  ('tripcompany',  '트립콤파니',                  'yt', 'UC0EQX5Z2TlaKeIw4O3ieZAQ',  356000, 22, true, true),
  ('janjanbari',   '잰잰바리',                    'yt', 'UCSxhYq6K0mxF24SmMGeNNQA',  237000, 23, true, true),
  ('jaehocance',   '재호캉스',                    'yt', 'UC602PUDJWt8AKCx3CFjJtTA',  230000, 24, true, true),
  ('sugilway',     '수길따라 sugilway',           'yt', 'UCxQ6xsoXqeVqrDvm71rByQQ',  189000, 25, true, true),
  ('minimalnomad', '미니멀유목민',                'yt', 'UCslBuOyn9Df1M3HjBaG377g',  180000, 26, true, true),
  ('potatoturtle', '포테이토 터틀',               'yt', 'UCj7o9mtW6vvRGQPjjkTSykg',  175000, 27, true, true),
  ('uiland',       '유일랜드 Uiland',             'yt', 'UCROZ65h0wA0LPNDMwpS5xPw',  241000, 28, true, true),
  ('jangteacher',  '장슨생 jangteacher',          'yt', 'UC1uoQwHK5e5gw0CYdQeX5IA',  160000, 29, true, true),
  ('yourangss',    '유랑쓰 YOURANGSS',            'yt', 'UCnVEtY_GfM7meN1-pyl7E7A',  225000, 30, true, true),
  ('geotdaga',     '걷다가',                      'yt', null,                        154000, 31, false, true)
on conflict (slug) do update
  set yt_channel_id = coalesce(excluded.yt_channel_id, travel_channels.yt_channel_id),
      name = excluded.name, subs = excluded.subs, sort = excluded.sort,
      resolved = travel_channels.resolved or excluded.resolved,
      active = true;

-- 핸들이 알려진 두 채널은 handle 로 채운다(channels.list?forHandle = 1유닛, search 보다 100배 싸다).
update public.travel_channels set yt_handle = '@서재로36' where slug = 'seojaero36' and yt_channel_id is null;
update public.travel_channels set yt_handle = '@걷다가'   where slug = 'geotdaga'   and yt_channel_id is null;

/* 이름만 아는 채널 — 여행유튜버 갤러리 투표 상위권과 톱100에서 빠진 이름들.
   resolved=false 라 수집기가 회차당 1개씩만 search.list(100유닛)로 해석한다.
   ⚠️ 한 번에 다 켜지 말 것. 20개를 한 회차에 해석하면 그날 유튜브 쿼터가 통째로 날아간다. */
insert into public.travel_channels (slug, name, kind, subs, sort, resolved, active) values
  ('kimhanryang',  '김한량',                      'yt', null, 40, false, true),
  ('pokgant',      '폭간트',                      'yt', null, 41, false, true),
  ('jotube',       'Joe튜브',                     'yt', null, 42, false, true),
  ('youngalnam',   '영알남',                      'yt', null, 43, false, true),
  ('sisugirit',    '시수기릿',                    'yt', null, 44, false, true),
  ('travelbrochure','여행브로셔',                 'yt', null, 45, false, true),
  ('makadatv',     '마카다TV',                    'yt', null, 46, false, true),
  ('papatravel',   '파파트래블',                  'yt', null, 47, false, true),
  ('ozibro',       '오지브로',                    'yt', null, 48, false, true),
  ('islandtraveler','아일랜드 트래블러',          'yt', null, 49, false, true)
on conflict (slug) do nothing;
