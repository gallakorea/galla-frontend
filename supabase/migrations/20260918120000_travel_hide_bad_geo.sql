-- QA(26.9.18): pending 으로 내린 27곳 중 travel_pending_geo 가 5곳은 올바른 좌표를 새로 찾아 되살렸다(정상).
-- 2곳은 같은 엉뚱한 좌표로 되살아나 hidden 으로 내린다 — hidden 은 자동 재검사 대상이 아니다.
update travel_places set status = 'hidden'
 where status = 'live' and (
   (country_code = 'PE' and name = '아마존 우림' and lon between -61 and -59) or
   (country_code = 'KR' and name = '오알피 위처' and lat > 50));
