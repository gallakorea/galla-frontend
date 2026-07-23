-- =========================================================
-- 🩺 클라이언트 에러 로깅 (2026-07-24) — Management API로 적용됨, 기록용.
-- 출시 후 실사용자 폰의 JS 에러를 무료로 자체 수집(Sentry 대체). 프론트 js/error-logger.js.
-- =========================================================

create table if not exists public.client_errors (
  id bigserial primary key,
  user_id uuid, kind text, message text, stack text, source text,
  line int, col int, ua text, ver text, path text,
  created_at timestamptz not null default now()
);
create index if not exists ce_created_idx on public.client_errors(created_at desc);
create index if not exists ce_msg_idx on public.client_errors(message);
alter table public.client_errors enable row level security;   -- 직접접근 없음(RPC만)
revoke all on public.client_errors from anon, authenticated;

-- 수집 RPC: 길이 캡 + 60초 동일메시지 중복 억제
create or replace function public.log_client_error(
  p_kind text, p_message text, p_stack text default null, p_source text default null,
  p_line int default null, p_col int default null, p_ver text default null, p_path text default null)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_user uuid := auth.uid();
begin
  if coalesce(btrim(p_message),'')='' then return; end if;
  if exists (select 1 from client_errors where message = left(p_message,500)
              and coalesce(user_id::text,'a')=coalesce(v_user::text,'a')
              and created_at > now() - interval '60 seconds') then return; end if;
  insert into client_errors(user_id, kind, message, stack, source, line, col, ua, ver, path)
  values (v_user, left(coalesce(p_kind,'error'),20), left(p_message,500), left(p_stack,4000),
          left(p_source,300), p_line, p_col,
          left(current_setting('request.headers', true)::json->>'user-agent',300),
          left(p_ver,12), left(p_path,200));
end $fn$;
grant execute on function public.log_client_error(text,text,text,text,int,int,text,text) to anon, authenticated;

-- 관리자 조회: 메시지별 그룹(발생수·영향유저·최근·샘플)
create or replace function public.admin_client_errors(p_hours int default 48, p_limit int default 100)
returns table(message text, kind text, hits bigint, users bigint, last_seen timestamptz,
              sample_ver text, sample_path text, sample_stack text)
language sql security definer set search_path to 'public' as $fn$
  select message, min(kind), count(*), count(distinct user_id), max(created_at),
         (array_agg(ver order by created_at desc))[1],
         (array_agg(path order by created_at desc))[1],
         (array_agg(stack order by created_at desc))[1]
  from client_errors
  where _is_admin() and created_at > now() - make_interval(hours => p_hours)
  group by message order by count(*) desc limit p_limit;
$fn$;
grant execute on function public.admin_client_errors(int,int) to authenticated;
revoke execute on function public.admin_client_errors(int,int) from anon, public;

-- 14일 보존(cron): select cron.schedule('client_errors_purge','30 4 * * *',
--   $$delete from public.client_errors where created_at < now() - interval '14 days'$$);
