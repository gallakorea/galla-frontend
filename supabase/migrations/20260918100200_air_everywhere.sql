-- 미세먼지를 날씨 화면 전부에 붙인다(26.9.18 「지도랑 다른데도」)
-- 측정소→시군구 연결은 측정소 행에 저장(air_refresh) — 조회 때마다 672번 계산하지 않게.
alter table public.air_station_obs add column if not exists city text;
create or replace function public.air_refresh() returns integer language sql security definer set search_path to 'public' as $$
  update air_station_obs set city = public.air_station_region(sido, station) where city is null;
  select count(*)::int from air_station_obs where city is not null;
$$;
create or replace view public.air_region as
  with st as (
    select a.*, (select code from weather_regions where kind='sido' and name=a.sido) sido_code
      from air_station_obs a where a.updated_at > now() - interval '3 hours'
  ),
  sido as (select sido_code region, round(avg(pm10)) pm10, round(avg(pm25)) pm25, count(*) n, max(data_time) data_time
             from st where sido_code is not null group by 1),
  city as (select city region, round(avg(pm10)) pm10, round(avg(pm25)) pm25, count(*) n, max(data_time) data_time
             from st where city is not null group by 1)
  select region, pm10, pm25, n, data_time, false est from sido
  union all select region, pm10, pm25, n, data_time, false from city
  union all select c.code, s.pm10, s.pm25, 0, s.data_time, true
    from weather_regions c join sido s on s.region = c.parent
   where c.kind='city' and not exists (select 1 from city x where x.region = c.code);
/* 한 지역의 미세먼지 — 동(읍면동)은 그 시군구 값 */
create or replace function public.air_of(p_region text) returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('pm10', a.pm10, 'pm25', a.pm25, 'est', a.est, 'at', a.data_time)
    from air_region a
   where a.region = coalesce((select case when kind='dong' then parent else code end from weather_regions where code = p_region), p_region)
   limit 1;
$$;
grant execute on function public.air_of(text) to anon, authenticated;


CREATE OR REPLACE FUNCTION public.weather_room(p_region text, p_limit integer DEFAULT 40)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb; c record;
begin
  select r.code, r.name, r.kind, s.name sido, o.temp, o.precip, o.code wmo, o.obs_at
    into c
    from weather_regions r
    left join weather_regions s on s.code = r.parent
    left join weather_obs o on o.region = r.code
   where r.code = p_region;
  if c.code is null then return jsonb_build_object('ok',false,'reason','bad_region'); end if;

  if c.kind = 'dong' and (c.obs_at is null or c.obs_at < now() - interval '60 minutes') then
    if not exists (select 1 from weather_fetch_req where region = c.code and requested_at > now() - interval '5 minutes')
       and (select count(*) from weather_fetch_req where requested_at > now() - interval '1 hour') < 300 then
      insert into weather_fetch_req(region, requested_at) values (c.code, now())
        on conflict (region) do update set requested_at = excluded.requested_at;
      begin
        perform net.http_post(
          url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/weather-sync',
          headers := jsonb_build_object('Content-Type','application/json',
                       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'svc_role_key')),
          body := jsonb_build_object('region', c.code),
          timeout_milliseconds := 20000);
      exception when others then null;   -- 수집 요청 실패가 방 열기를 막으면 안 된다
      end;
    end if;
  end if;

  /* 한마디는 최근 2시간만. 날씨는 순간이라 어제 글이 섞이면 판이 죽는다. */
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'body', t.body, 'at', t.created_at,
           'nick', coalesce(u.nickname,'익명'), 'uid', t.user_id
         ) order by t.created_at desc), '[]'::jsonb)
    into v
    from (select * from weather_comments
           where region = p_region and status='active' and created_at > now() - interval '2 hours'
           order by created_at desc limit greatest(1, least(coalesce(p_limit,40),100))) t
    left join users u on u.id = t.user_id;

  return jsonb_build_object('ok',true,
    'region', jsonb_build_object('code',c.code,'name',c.name,'sido',c.sido,
                                 'temp',c.temp,'precip',c.precip,
                                 'code_wmo', coalesce(to_jsonb(c.wmo), '"na"'::jsonb),
                                 'obs_at',c.obs_at, 'air', public.air_of(c.code)),
    'says', v,
    'reports', (select jsonb_build_object(
        'rain',count(*) filter (where kind='rain'),
        'snow',count(*) filter (where kind='snow'),
        'none',count(*) filter (where kind='none'))
      from weather_reports where region=p_region and created_at > now()-interval '30 minutes'),
    'faved', (auth.uid() is not null and exists (select 1 from weather_favs where user_id=auth.uid() and region=p_region)));
end $function$;

CREATE OR REPLACE FUNCTION public.weather_my()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
      'code', c.code, 'name', c.name, 'sido', s.name,
      'temp', o.temp, 'precip', o.precip,
      'code_wmo', coalesce(to_jsonb(o.code), '"na"'::jsonb), 'obs_at', o.obs_at,
      'rain', coalesce(r.rain,0), 'snow', coalesce(r.snow,0), 'none', coalesce(r.none,0),
      'reports', coalesce(r.rain,0)+coalesce(r.snow,0)+coalesce(r.none,0),
      'says', coalesce(m.n,0), 'air', public.air_of(c.code)
    ) order by f.sort, c.sort), '[]'::jsonb)
  from weather_favs f
  join weather_regions c on c.code = f.region
  left join weather_regions s on s.code = c.parent
  left join weather_obs o on o.region = c.code
  left join lateral (select count(*) filter (where kind='rain') rain,
                            count(*) filter (where kind='snow') snow,
                            count(*) filter (where kind='none') none
                     from weather_reports w where w.region=c.code and w.created_at > now()-interval '30 minutes') r on true
  left join lateral (select count(*) n from weather_comments t
                     where t.region=c.code and t.status='active' and t.created_at > now()-interval '2 hours') m on true
  where f.user_id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.weather_search(p_q text, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  /* ⚠️ LIMIT 은 집계 '전에' 걸어야 한다 — jsonb_agg 밖에 두면 결과가 한 행이라 아무 효과가 없다. */
  select coalesce(jsonb_agg(t order by t_sort), '[]'::jsonb) from (
    select jsonb_build_object('code', c.code, 'name', c.name,
             'sido', case when c.kind = 'dong'
                          then coalesce(p.name, '') || case when g.name is not null then ' · ' || g.name else '' end
                          else p.name end,
             'kind', c.kind, 'temp', o.temp,
             'code_wmo', coalesce(to_jsonb(o.code), '"na"'::jsonb), 'air', public.air_of(c.code)) t,
           (case c.kind when 'city' then 0 when 'dong' then 1 else 2 end) * 100000 + c.sort t_sort
    from weather_regions c
    left join weather_regions p on p.code = c.parent
    left join weather_regions g on g.code = p.parent
    left join weather_obs o on o.region = c.code
    where btrim(coalesce(p_q,'')) <> ''
      and (c.name ilike '%'||btrim(p_q)||'%'
           or (c.kind <> 'dong' and p.name ilike '%'||btrim(p_q)||'%'))
    order by t_sort
    limit greatest(1, least(coalesce(p_limit,20), 50))
  ) q
$function$;

CREATE OR REPLACE FUNCTION public.weather_now()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  /* 전국 요약은 시도 17개만 — 시군구 133곳까지 매번 내려보내면 무겁다.
     동네 단위는 검색(weather_search)·즐겨찾기(weather_my)·방(weather_room)이 담당한다. */
  select jsonb_build_object('ok', true, 'now', now(),
    'regions', coalesce(jsonb_agg(jsonb_build_object(
      'code', r.code, 'name', r.name, 'temp', o.temp, 'precip', o.precip,
      'code_wmo', o.code, 'obs_at', o.obs_at,
      'rain', coalesce(s.rain,0), 'snow', coalesce(s.snow,0), 'none', coalesce(s.none,0),
      'reports', coalesce(s.rain,0)+coalesce(s.snow,0)+coalesce(s.none,0),
      'says', coalesce(m.n,0), 'air', public.air_of(r.code)
    ) order by r.sort), '[]'::jsonb))
  from weather_regions r
  left join weather_obs o on o.region = r.code
  left join lateral (select count(*) filter (where kind='rain') rain,
                            count(*) filter (where kind='snow') snow,
                            count(*) filter (where kind='none') none
                     from weather_reports w where w.region=r.code and w.created_at > now()-interval '30 minutes') s on true
  left join lateral (select count(*) n from weather_comments t
                     where t.region=r.code and t.status='active' and t.created_at > now()-interval '2 hours') m on true
  where r.kind = 'sido'
$function$;

CREATE OR REPLACE FUNCTION public.weather_map()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('ok', true, 'now', now(),
    'points', coalesce(jsonb_agg(jsonb_build_object(
      'code', r.code, 'name', r.name, 'kind', r.kind, 'parent', r.parent,
      'lat', r.lat, 'lon', r.lon,
      'temp', o.temp, 'precip', o.precip, 'code_wmo', o.code, 'obs_at', o.obs_at,
      'wet', coalesce(s.wet, 0), 'dry', coalesce(s.dry, 0), 'pm10', ar.pm10, 'pm25', ar.pm25, 'pm_est', ar.est
    ) order by r.kind desc, r.sort), '[]'::jsonb))
  from weather_regions r
  left join weather_obs o on o.region = r.code
  left join air_region ar on ar.region = r.code
  left join lateral (select count(*) filter (where kind in ('rain','snow')) wet,
                            count(*) filter (where kind = 'none') dry
                       from weather_reports w
                      where w.region = r.code and w.created_at > now() - interval '30 minutes') s on true
  where r.kind in ('sido', 'city') and r.lat is not null;
$function$;

-- 30분마다 수집(에어코리아는 시간 단위 발표). ⚠️ Authorization 필수 — 없으면 401 인데 크론 이력엔 성공으로 남는다(크론 인증 함정)
select cron.unschedule('air_sync_job') where exists (select 1 from cron.job where jobname='air_sync_job');
select cron.schedule('air_sync_job', '7,37 * * * *', $c$
select net.http_post(
  url:='https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/air-sync',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'svc_role_key')),
  body:='{}'::jsonb, timeout_milliseconds := 120000) $c$);
