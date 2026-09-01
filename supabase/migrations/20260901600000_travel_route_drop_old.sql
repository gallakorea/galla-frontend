-- 옛 travel_route(text,int) 제거 (2026-09-01)
-- ⚠️ `create or replace` 는 **인자 목록이 다르면 새 오버로드를 만든다**. 옛 함수가 그대로 남아
--    PostgREST 가 {p_channel, p_limit} 호출에서 어느 쪽인지 못 골라 통째로 실패했다
--    ("Could not choose the best candidate function"). 프런트는 rpc 실패를 null 로 삼켜서
--    "경로가 안 그려진다"로만 보였다. 시그니처를 바꿀 땐 옛 것을 반드시 지운다.
drop function if exists public.travel_route(text, integer);
