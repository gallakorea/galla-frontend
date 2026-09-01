-- '국회의원 정치자금' → '국회의원'.
--
-- 이름에 자금 출처(정치자금)를 박아둔 게 문제였다. 이 축의 정보는 '누가 다녀갔나'지
-- '무슨 돈으로 먹었나'가 아니다. 다른 채널은 전부 '누구'로 서 있는데(또간집·김사원·백년가게)
-- 여기만 회계 용어라 층위가 어긋났다.
--
-- ⚠️ slug 은 그대로 둔다(assembly). GOVMARK·govMark 가 slug 으로 국회 휘장을 고르고,
--    food_place_sources.channel 5만여 행이 이 값을 참조한다. 표시 이름만 바꾼다.
update food_channels set name = '국회의원' where slug = 'assembly';
