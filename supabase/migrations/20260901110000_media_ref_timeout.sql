/* refresh_media_refs 는 함수 안에서 statement_timeout 을 300s 로 올리고 있었다.
   소용없다 — 이 함수를 부르는 문장의 타이머는 문장이 시작될 때 이미 걸렸고,
   실행 중에 값을 바꿔도 다시 걸리지 않는다. 전역 120s 에서 그대로 죽었다(08-29 실측).
   평소 67~101초라 한계에 붙어 있었고, 데이터가 늘면 상시 실패로 갔을 것이다.
   타임아웃은 부르는 쪽에서 미리 건다 — 크론 command 앞에 SET 을 둔다. */
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='media_ref_refresh'),
  command := 'set statement_timeout = ''300s''; select public.refresh_media_refs();');
