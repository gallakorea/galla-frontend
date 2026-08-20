-- "지금 우리 동네" 날씨 탭 (2026-08-20)
--
-- 기상청이 말하는 실황과, 지금 거기 있는 사람들의 제보를 나란히 놓는다.
-- 둘이 어긋날 때가 이 기능의 재미다 — "기상청은 맑다는데 우리 동네는 쏟아짐".
-- 갈라 정체성(여론·예측)과도 맞는다: 실시간 현실에 대한 크라우드 투표다.
--
-- ⚠️ 아래 DDL 은 Management API 로 이미 적용됐다. 기록·재현용.

create table if not exists public.weather_regions (
  code text primary key, name text not null,
  lat numeric not null, lon numeric not null, sort int not null default 0);

create table if not exists public.weather_obs (
  region text primary key references public.weather_regions(code) on delete cascade,
  temp numeric, precip numeric, code int, wind numeric,
  obs_at timestamptz, updated_at timestamptz not null default now());

create table if not exists public.weather_reports (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade,
  region text not null references public.weather_regions(code) on delete cascade,
  kind text not null check (kind in ('rain','snow','none')),
  created_at timestamptz not null default now());

create index if not exists weather_reports_recent on public.weather_reports (region, created_at desc);
create index if not exists weather_reports_user_recent on public.weather_reports (user_id, created_at desc);

-- 지역별 실황 + 최근 30분 제보. 제보는 30분만 — 날씨는 금방 바뀌고 옛 제보는 거짓말이 된다.
create or replace function public.weather_now()
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', true, 'now', now(),
    'regions', coalesce(jsonb_agg(jsonb_build_object(
      'code', r.code, 'name', r.name, 'temp', o.temp, 'precip', o.precip,
      'code_wmo', o.code, 'wind', o.wind, 'obs_at', o.obs_at,
      'rain', coalesce(s.rain,0), 'snow', coalesce(s.snow,0), 'none', coalesce(s.none,0),
      'reports', coalesce(s.rain,0)+coalesce(s.snow,0)+coalesce(s.none,0)
    ) order by r.sort), '[]'::jsonb))
  from weather_regions r
  left join weather_obs o on o.region = r.code
  left join lateral (
    select count(*) filter (where kind='rain') rain,
           count(*) filter (where kind='snow') snow,
           count(*) filter (where kind='none') none
    from weather_reports w
    where w.region = r.code and w.created_at > now() - interval '30 minutes') s on true
$fn$;

-- 제보. 한 사람이 도배하면 집계가 거짓말이 되므로 지역당 5분 쿨다운(차단이 아니라 쿨다운 —
-- '방금 바뀌었다'는 제보는 살려야 한다).
create or replace function public.weather_report(p_region text, p_kind text)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid(); v_last timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_kind not in ('rain','snow','none') then return jsonb_build_object('ok',false,'reason','bad_kind'); end if;
  if not exists (select 1 from weather_regions where code = p_region) then
    return jsonb_build_object('ok',false,'reason','bad_region'); end if;
  select max(created_at) into v_last from weather_reports where user_id = v_uid and region = p_region;
  if v_last is not null and v_last > now() - interval '5 minutes' then
    return jsonb_build_object('ok',false,'reason','cooldown',
      'wait_sec', ceil(extract(epoch from (v_last + interval '5 minutes' - now())))); end if;
  insert into weather_reports(user_id, region, kind) values (v_uid, p_region, p_kind);
  return jsonb_build_object('ok',true,'region',p_region,'kind',p_kind) || (
    select jsonb_build_object('rain',count(*) filter (where kind='rain'),
                              'snow',count(*) filter (where kind='snow'),
                              'none',count(*) filter (where kind='none'))
      from weather_reports where region=p_region and created_at > now() - interval '30 minutes');
end $fn$;

grant execute on function public.weather_now() to anon, authenticated;      -- 보기는 비로그인도
revoke all on function public.weather_report(text,text) from public, anon;  -- 제보는 로그인만
grant execute on function public.weather_report(text,text) to authenticated;

do $chk$
begin
  if (select count(*) from weather_regions) < 17 then
    raise exception '시·도 좌표가 빠졌다 — weather-sync 가 반쪽만 받는다';
  end if;
end $chk$;
