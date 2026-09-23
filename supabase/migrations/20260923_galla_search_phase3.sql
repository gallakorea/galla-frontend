-- 🎯 검색 개인화 Phase 3(26.9.23) — galla_search 에 성향 벡터 2개(관심 부스트·싫어함 패널티) 추가.
-- 실제 함수 본문은 배포 스크립트로 생성(5코너 반복). 가중치: 관심 +0.15, 싫어함 -0.12(질의 관련성이 우선).
-- 취향 벡터 = friend_memory(interest/preference vs disliked/banned) 임베딩의 salience 가중 평균(정규화), gallaSearch 가 만들어 넘긴다.
-- 옛 4인자 galla_search 는 제거(오버로드 충돌). 이 파일은 기록용 — 함수 정의는 20260923_galla_search_phase2 계열과 함께 운영에 반영됨.
comment on function public.galla_search(text,vector,text[],int,vector,vector) is 'Phase3: 하이브리드+개인화 통합검색(이슈·광장·뉴스·맛집·여행). p_interest_vec 부스트·p_dislike_vec 패널티.';
