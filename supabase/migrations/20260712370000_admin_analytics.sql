-- 🛠 관리자 관제 P1 — 활동 계측 + 트래픽/성장 분석 + 감사로그
-- 접근: 모두 _is_admin() 게이트. 계측 ping은 로그인 유저가 세션·시간당 1회.

-- 활동 핑(페이지 로드 기반, 유저·날짜·시각별 1행)
create table if not exists public.activity_pings (
  user_id uuid not null,
  ping_date date not null,
  ping_hour int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, ping_date, ping_hour)
);
alter table public.activity_pings enable row level security;
-- 조회는 admin RPC로만(직접 select 불가). insert는 RPC로.
create or replace function public.activity_ping()
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then return; end if;
  insert into activity_pings(user_id, ping_date, ping_hour)
    values (v_user, current_date, extract(hour from now())::int)
  on conflict (user_id, ping_date, ping_hour) do nothing;
end $$;
grant execute on function public.activity_ping() to authenticated;

-- 감사로그
create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  actor uuid, action text not null, target text, meta jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit enable row level security;
create or replace function public._admin_log(p_action text, p_target text, p_meta jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into admin_audit(actor, action, target, meta) values (auth.uid(), p_action, p_target, p_meta);
$$;

-- 통합 활동 소스(핑 + 실제 활동) — DAU/MAU/시간당 집계용
create or replace view public._active_events as
  select user_id, created_at from activity_pings
  union all select user_id, created_at::timestamptz from point_ledger
  union all select user_id, created_at::timestamptz from comments
  union all select user_id, created_at::timestamptz from votes;

-- 트래픽 대시보드
create or replace function public.admin_traffic()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; v_hourly jsonb;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  select jsonb_agg(jsonb_build_object('h', to_char(h,'HH24'), 'label', to_char(h,'MM/DD HH24"시"'), 'users', c) order by h)
    into v_hourly
  from (
    select gs as h, (select count(distinct user_id) from _active_events e
                     where e.created_at >= gs and e.created_at < gs + interval '1 hour') c
    from generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') gs
  ) t;

  select jsonb_build_object('ok',true,
    'realtime', (select count(distinct user_id) from _active_events where created_at >= now() - interval '1 hour'),
    'online5m', (select count(distinct user_id) from _active_events where created_at >= now() - interval '5 minutes'),
    'dau', (select count(distinct user_id) from _active_events where created_at >= current_date),
    'wau', (select count(distinct user_id) from _active_events where created_at >= now() - interval '7 days'),
    'mau', (select count(distinct user_id) from _active_events where created_at >= now() - interval '30 days'),
    'total_users', (select count(*) from user_profiles),
    'today', jsonb_build_object(
      'signups', (select count(*) from user_profiles where created_at >= current_date),
      'issues',  (select count(*) from issues where created_at >= current_date),
      'comments',(select count(*) from comments where created_at >= current_date and status<>'deleted'),
      'votes',   (select count(*) from votes where created_at >= current_date),
      'duels',   (select count(*) from duels where created_at >= current_date),
      'trades',  (select count(*) from market_trades where created_at >= current_date)),
    'hourly', coalesce(v_hourly,'[]'::jsonb)) into v;
  return v;
end $$;

-- 성장 추이(최근 14일 가입 + DAU)
create or replace function public.admin_growth()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  select jsonb_build_object('ok',true,'days', jsonb_agg(jsonb_build_object(
      'd', to_char(d,'MM/DD'),
      'signups', (select count(*) from user_profiles where created_at::date = d),
      'dau', (select count(distinct user_id) from _active_events where created_at::date = d)
    ) order by d)) into v
  from generate_series((current_date - 13), current_date, interval '1 day') d;
  return v;
end $$;

grant execute on function public.admin_traffic() to authenticated;
grant execute on function public.admin_growth()  to authenticated;
