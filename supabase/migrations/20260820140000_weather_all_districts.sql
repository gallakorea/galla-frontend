-- 날씨 3차 — 전국 시·군·구 227곳 (2026-08-20)
--
-- 사장님: "동네로 어떻게 검색해서 들어가?" → 확인해보니 광역시 구가 하나도 없었다.
--   강남·해운대를 쳐도 안 나왔다. 이용자 대부분이 거기 사는데.
--
-- 🚨 좌표 출처를 갈아엎었다.
--   1차는 Open-Meteo 지오코딩을 썼는데 그건 **행정구역 목록이 아니라 지명 사전**이다.
--   "Gangnam" 을 치면 서울 강남구가 아니라 **전북 고창의 마을**이 나온다(실측).
--   그대로 뒀으면 강남 날씨가 고창 날씨로 나갈 뻔했다.
--   → OpenStreetMap Nominatim 으로 전면 교체. 시도 정식명을 붙여 질의하고
--     display_name 에 기대 시도가 들어 있는 것만 채택했다(227/227 확보).
--     ⚠️ 정책상 초당 1회 — 재수집은 4분 이상 걸린다. 함부로 다시 돌리지 말 것.
--
-- 지점 244 = 시도 17 + 시군구 227. Open-Meteo 는 한 요청에 229 좌표까지 받지만(실측)
-- 여유를 두고 weather-sync 가 100개씩 끊어 요청한다.

do $chk$
declare n int; g int;
begin
  select count(*) into n from weather_regions where kind='city';
  if n < 200 then raise exception '시군구가 %개뿐이다 — 광역시 구가 빠졌거나 되돌아갔다', n; end if;
  -- 광역시 구가 실제로 들어있는지(1차 사고 재발 감시)
  select count(*) into g from weather_regions where parent in ('seoul','busan','daegu','incheon','gwangju','daejeon','ulsan');
  if g < 60 then raise exception '광역시 산하 구가 %개뿐이다 — 강남·해운대가 검색되지 않는다', g; end if;
end $chk$;
