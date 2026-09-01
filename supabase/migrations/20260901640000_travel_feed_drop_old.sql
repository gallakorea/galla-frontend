-- 옛 travel_feed(5인자) 제거 (2026-09-01)
-- ⚠️ travel_route 에서 겪은 것과 **같은 사고**다. `create or replace` 는 인자 목록이 달라지면
--    새 오버로드를 만들고, 옛 것이 남아 PostgREST 가 함수를 못 고른다
--    ("Could not choose the best candidate function"). 프런트는 rpc 실패를 null 로 삼켜서
--    '목록이 안 나온다'로만 보인다. 시그니처를 바꿀 때는 항상 옛 것을 drop 한다.
--    점검 질의: select proname, count(*) from pg_proc where proname like 'travel_%' group by 1 having count(*)>1;
drop function if exists public.travel_feed(text, text, text, integer, integer);
