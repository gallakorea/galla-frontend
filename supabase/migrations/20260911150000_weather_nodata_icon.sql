-- 🏘 관측이 없는 곳을 '맑음'으로 보여 주던 것 — 서버에서 막는다.
--
-- 원인(앱): js/weather.js wx(code) 가 Number(code) 로 바꾼 뒤 isFinite 로 '정보 없음'을 가르는데
--          Number(null) === 0 이라 null 이 **0 = 맑음(☀️)** 으로 떨어진다.
-- 왜 지금: 20260911140000_weather_dong 으로 들인 동 3,564곳은 누가 방을 열기 전까지 관측이 없다 →
--          동 검색 결과 대부분이 「☀️ 역삼1동」처럼 맑음으로 보였다(에뮬 실측 2026-09-11 13:53).
-- 처방: 관측 코드가 없으면 'na'(문자)를 준다 → Number('na') = NaN → 앱 기존 분기로 「· 정보 없음」.
--       앱 쪽 근본 수정(code == null 검사)은 별도 배포 몫. 이 처방은 앱 배포 없이 바로 먹는다.
-- 대상: weather_search · weather_room · weather_my (weather_now 는 시도만이라 늘 관측이 있다).

create or replace function public.weather_search(p_q text, p_limit integer default 20)
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  /* ⚠️ LIMIT 은 집계 '전에' 걸어야 한다 — jsonb_agg 밖에 두면 결과가 한 행이라 아무 효과가 없다. */
  select coalesce(jsonb_agg(t order by t_sort), '[]'::jsonb) from (
    select jsonb_build_object('code', c.code, 'name', c.name,
             'sido', case when c.kind = 'dong'
                          then coalesce(p.name, '') || case when g.name is not null then ' · ' || g.name else '' end
                          else p.name end,
             'kind', c.kind, 'temp', o.temp,
             'code_wmo', coalesce(to_jsonb(o.code), '"na"'::jsonb)) t,
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

create or replace function public.weather_room(p_region text, p_limit integer default 40)
 returns jsonb language plpgsql volatile security definer set search_path to 'public'
as $function$
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
                                 'obs_at',c.obs_at),
    'says', v,
    'reports', (select jsonb_build_object(
        'rain',count(*) filter (where kind='rain'),
        'snow',count(*) filter (where kind='snow'),
        'none',count(*) filter (where kind='none'))
      from weather_reports where region=p_region and created_at > now()-interval '30 minutes'),
    'faved', (auth.uid() is not null and exists (select 1 from weather_favs where user_id=auth.uid() and region=p_region)));
end $function$;

create or replace function public.weather_my()
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
      'code', c.code, 'name', c.name, 'sido', s.name,
      'temp', o.temp, 'precip', o.precip,
      'code_wmo', coalesce(to_jsonb(o.code), '"na"'::jsonb), 'obs_at', o.obs_at,
      'rain', coalesce(r.rain,0), 'snow', coalesce(r.snow,0), 'none', coalesce(r.none,0),
      'reports', coalesce(r.rain,0)+coalesce(r.snow,0)+coalesce(r.none,0),
      'says', coalesce(m.n,0)
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
