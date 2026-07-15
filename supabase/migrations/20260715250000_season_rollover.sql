-- 시즌 자동 롤오버: 끝난 시즌 비활성화 + 다음 시즌 자동 개시 (시즌 N = 순번)
create or replace function predict_season_rollover()
returns jsonb language plpgsql security definer set search_path to public as $$
declare v_closed int; v_new record; v_n int;
begin
  -- 1) 기간이 끝난 활성 시즌 닫기
  update predict_seasons set active=false where active and ends_at <= now();
  get diagnostics v_closed = row_count;

  -- 2) 활성 시즌이 없으면 새 시즌 개시 (이번 달, 이름은 순번)
  if not exists (select 1 from predict_seasons where active) then
    select count(*)+1 into v_n from predict_seasons;
    insert into predict_seasons(name, starts_at, ends_at)
    values ('시즌 '||v_n, date_trunc('month', now()), date_trunc('month', now()) + interval '1 month')
    returning * into v_new;
    return jsonb_build_object('ok',true,'closed',v_closed,'new_season',v_new.name);
  end if;
  return jsonb_build_object('ok',true,'closed',v_closed,'new_season',null);
end $$;
revoke all on function predict_season_rollover() from public, anon, authenticated;

-- 크론: 매일 00:05 KST(15:05 UTC) 체크 — 월이 바뀐 첫날 자동 롤오버 (매일 돌아도 멱등)
select cron.unschedule('predict_season_rollover_job') where exists (
  select 1 from cron.job where jobname = 'predict_season_rollover_job'
);
select cron.schedule(
  'predict_season_rollover_job',
  '5 15 * * *',
  $$select predict_season_rollover();$$
);
