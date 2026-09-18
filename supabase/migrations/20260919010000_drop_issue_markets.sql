-- 🗑 예측의 「이슈 승패」 콘텐츠 전부 삭제 + 앞으로도 안 만든다(26.9.19 사장님: 「다 지워 버려, 앞으로도 올리지 마」).
-- 삭제 전 집계: 56개(진행 3), 전부 갈라 공식 계정, 참여 2건(정산 완료·600GP), 댓글 0, 저장 2.
-- 자식 테이블(outcomes·bets·bookmarks·comments·reactions 등)은 FK on delete cascade.
select cron.unschedule('predict_issue_market_job') where exists (select 1 from cron.job where jobname = 'predict_issue_market_job');
-- 다시 켜져도 아무것도 안 하게
create or replace function public.cron_create_issue_market()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('ok', false, 'reason', 'disabled_26_09_19');
$$;
delete from markets where question like '%이슈 승패%';
