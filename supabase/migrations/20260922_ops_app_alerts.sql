-- 🛰 갈라 관제 앱 분리(26.9.22 사장님: 위기 감지를 앱으로 오게 하지 마, 관리자 페이지를 앱에서 열리게 하지 마, 관리자 앱을 SPA로 따로)
-- 관리자 알림(위기·신고·버그 신고)은 더 이상 일반 알림함(notifications)·갈라 앱 푸시로 가지 않는다.
-- ops_alerts 에 쌓이고, 관제 앱(/ops/)에서 구독한 웹푸시(ops_push_subs)로만 울린다.

create table if not exists public.ops_alerts (
  id bigserial primary key,
  kind text not null,                -- crisis | report | bug_report
  message text not null,
  ref jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
alter table public.ops_alerts enable row level security;
drop policy if exists ops_alerts_admin_sel on public.ops_alerts;
create policy ops_alerts_admin_sel on public.ops_alerts for select using (public.is_admin());
drop policy if exists ops_alerts_admin_upd on public.ops_alerts;
create policy ops_alerts_admin_upd on public.ops_alerts for update using (public.is_admin()) with check (public.is_admin());
grant select, update on public.ops_alerts to authenticated;
create index if not exists ops_alerts_created on public.ops_alerts (created_at desc);

create table if not exists public.ops_push_subs (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.ops_push_subs enable row level security;
drop policy if exists ops_push_subs_own on public.ops_push_subs;
create policy ops_push_subs_own on public.ops_push_subs for all
  using (user_id = auth.uid() and public.is_admin())
  with check (user_id = auth.uid() and public.is_admin());
grant select, insert, update, delete on public.ops_push_subs to authenticated;

-- 새 관제 알림 → send-push(kind:ops) — 기존 notifications_push 와 같은 인증 방식(vault)
create or replace function public._trg_ops_alert_push()
returns trigger language plpgsql security definer set search_path to 'public', 'vault', 'net' as $$
declare k text; jwt text;
begin
  select decrypted_secret into k   from vault.decrypted_secrets where name = 'push_svc_key' limit 1;
  select decrypted_secret into jwt from vault.decrypted_secrets where name = 'svc_role_key' limit 1;
  if k is null or jwt is null then return new; end if;
  perform net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || jwt, 'x-push-key', k),
    body := jsonb_build_object('kind', 'ops', 'id', new.id::text),
    timeout_milliseconds := 8000);
  return new;
exception when others then return new;
end $$;
drop trigger if exists trg_ops_alert_push on public.ops_alerts;
create trigger trg_ops_alert_push after insert on public.ops_alerts
  for each row execute function public._trg_ops_alert_push();

-- 위기: 레드팀·QA 풀 계정은 알리지 않는다(26.9.22 안전 시험 15건이 사장님 폰을 울렸다)
create or replace function public._trg_crisis_notify_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if public.is_redteam_uid(new.user_id) then return new; end if;
    insert into ops_alerts(kind, message, ref)
    values ('crisis', '🆘 위기 신호 감지 — ' || coalesce(new.term, ''), jsonb_build_object('crisis_id', new.id, 'user_id', new.user_id));
  exception when others then null;
  end;
  return new;
end $$;

create or replace function public._trg_report_notify_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into ops_alerts(kind, message, ref)
    values ('report', '🚨 신고 접수 — ' || coalesce(new.target_kind, '') || ' / ' || coalesce(new.reason, ''), jsonb_build_object('reporter', new.reporter));
  exception when others then null;   -- 알림 실패가 신고 접수를 되돌리지 않게
  end;
  return new;
end $$;

create or replace function public._trg_bug_notify_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into ops_alerts(kind, message, ref)
    values ('bug_report', '🐞 버그 신고 접수', jsonb_build_object('user_id', new.user_id));
  exception when others then null;
  end;
  return new;
end $$;

-- 갈라 앱 알림함에 이미 들어간 관리자 알림은 읽음 처리(지우지 않는다 — 원본 기록은 crisis_events·reports·bug_reports 에 있다)
update public.notifications set read = true where type in ('crisis', 'report', 'bug_report') and coalesce(read, false) = false;
