-- 이중 환급 + 오버로드 지뢰 제거.
--
-- ① ingest-places-photos 가 안 쓴 예산(`budget - called`)을 **두 번** 환급하고 있었다.
--    한 번은 옛 1인자 places_refund(integer), 한 번은 places_refund(text,integer).
--    그래서 장부가 실제 지출보다 적게 찍혔다 — 크레딧이 미터보다 빨리 마른 이유다.
--    엣지 함수에서 앞쪽 호출을 지웠고, 여기서 옛 시그니처 자체를 없앤다.
--
-- ② 같은 이름 두 개는 PostgREST 가 못 고른다(PGRST203). 이 프로젝트에서 이미 세 번 밟았다.
--    쓰는 데가 없음을 확인하고 지운다(pg_proc·cron.job 전수 조회 결과 참조 0).
drop function if exists public.places_refund(integer);

-- places_take 는 원화 미터(places_spend)로 대체된 옛 '건수' 장부다. 남아 있으면
-- 다음 사람이 어느 쪽이 진짜 관문인지 헷갈린다. 호출부가 없음을 확인하고 지운다.
drop function if exists public.places_take(integer, integer);
