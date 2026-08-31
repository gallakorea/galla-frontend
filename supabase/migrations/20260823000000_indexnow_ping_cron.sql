-- IndexNow 자동 통보 크론 (2026-08-23)
--
-- 배경: functions/indexnow.js 는 예전부터 있었지만 호출하는 코드가 레포 전체에 0건이었다.
--       "새 글 → 검색엔진 즉시 통보"가 실제로는 한 번도 돈 적이 없다.
-- 조치: /indexnow?recent=1 (최근 1시간치 이슈·갈라뉴스·광장·예측·갈라리 URL 일괄 제출)을
--       30분마다 때린다. 유저 작성분·크론 생성분이 한 경로로 다 덮이므로 작성 화면 JS는 안 건드린다.
-- 참고: 이 엔드포인트는 인증이 없다(제출 대상이 galla.im 호스트로 강제 필터됨).
--       [[galla-cron-auth-trap]] 의 401-succeeded 함정과 무관.
select cron.schedule(
  'indexnow_ping_job',
  '*/30 * * * *',
  $$ select net.http_get(url := 'https://galla.im/indexnow?recent=1', timeout_milliseconds := 20000) $$
);
