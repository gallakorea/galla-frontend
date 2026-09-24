-- 26.9.24 애플 Guideline 1.2 대응 — content_reports 능동 모더레이션(24h SLA)
-- ① 신고 접수 즉시 관리자 알림(ops_alerts) ② 24시간 초과 미처리 신고 경보 크론
-- (콘텐츠 삭제·이용자 밴은 기존 관제 admin_resolve_report·ban 으로 수행)

-- ① 신고 → 관리자 즉시 알림
create or replace function public._trg_content_report_notify()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  begin
    insert into ops_alerts(kind, message, ref)
    values (
      'report',
      '🚨 신고 접수 — ' || coalesce(new.content_type,'') || ' / ' || coalesce(new.reason,''),
      jsonb_build_object('content_type', new.content_type, 'content_id', new.content_id, 'reporter', new.reporter_id, 'report_id', new.id)
    );
  exception when others then null;  -- 알림 실패가 신고 접수를 되돌리지 않게
  end;
  return new;
end $$;

drop trigger if exists trg_content_report_notify on public.content_reports;
create trigger trg_content_report_notify
  after insert on public.content_reports
  for each row execute function public._trg_content_report_notify();

-- ② 24시간 초과 미처리 신고 경보 — resolve 시 행이 삭제되므로 '남아 있고 24h 지난 것' = 미처리
create or replace function public._content_report_sla_check()
returns void language plpgsql security definer set search_path=public as $$
declare n int;
begin
  select count(*) into n from content_reports where created_at < now() - interval '24 hours';
  if n > 0 then
    insert into ops_alerts(kind, message, ref)
    values ('report_sla',
      '⏰ 24시간 초과 미처리 신고 ' || n || '건 — 즉시 조치 필요',
      jsonb_build_object('overdue', n));
  end if;
end $$;

-- 매시간 SLA 점검(중복 방지: 같은 시간대 report_sla 알림이 이미 있으면 건너뜀)
create or replace function public._content_report_sla_cron()
returns void language plpgsql security definer set search_path=public as $$
begin
  if exists (select 1 from ops_alerts where kind='report_sla' and created_at > now() - interval '3 hours') then
    return;
  end if;
  perform _content_report_sla_check();
end $$;

select cron.schedule('content-report-sla', '17 * * * *', $$select public._content_report_sla_cron();$$);
