-- battle_action 3인자 구버전 제거 — 파쇄(p_break) 추가 때 4인자 신버전과 오버로드로 공존,
-- PostgREST가 3인자 호출(지원+쿨다운리셋 경로)을 PGRST203 애매성으로 전부 거부해
-- 💖 지원 버튼이 전면 고장 상태였다(2026-07-16~20 실측).
-- 교훈: 같은 이름의 RPC 오버로드 금지 — 인자 이름 집합이 부분집합이면 PostgREST가 후보를 못 고른다.
drop function if exists public.battle_action(bigint, text, boolean);
