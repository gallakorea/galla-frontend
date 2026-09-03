-- origin 에 'yt-title' 을 허용한다
--
-- 왜: 제목 기반 수확 경로를 붙였는데 origin 체크 제약이 새 값을 막아 food_ingest 가
-- **통째로 예외로 되돌아왔다**. 엣지 함수는 그걸 조용히 삼키고(res 기본값 new:0,dup:0)
-- 그대로 harvested_at 도장을 찍었다 — 검증 통과한 16곳이 사라지고 영상은 '처리됨'이 됐다.
-- 값을 구분해 두는 이유: 주소 근거 없이 제목+지역으로 찾은 것이라 나중에 정밀도를
-- 따로 재거나 되돌릴 수 있어야 한다.
alter table food_places drop constraint if exists food_places_origin_check;
alter table food_places add constraint food_places_origin_check
  check (origin = any (array['yt','yt-title','user','gov','tour','naver','google',
                            'goodprice','baeknyeon','seed']));
