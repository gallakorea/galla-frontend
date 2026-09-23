-- 🔎 맛집 하이브리드 통합(26.9.23) — galla_browse(food) 비-지오 검색을 ILIKE+FOOD_SYN 수작업에서
-- food_search RPC(트라이그램 + 벡터 bge-m3 + 개인화)로. 동네(주소)·메뉴(이름/분류) 분리 유지.
-- 근처(위치기반 food_map)는 그대로. 함수 본문은 배포 스크립트로 생성됨(기록용 주석).
comment on function public.food_search(text,text,vector,vector,vector,int) is '맛집 하이브리드 검색: p_menu(이름·분류 트라이그램)·p_place(주소)·p_vec(의미)·개인화(관심/싫어함)·rating_n 부스트.';
