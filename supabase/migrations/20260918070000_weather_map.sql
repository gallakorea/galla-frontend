-- 날씨 지도(26.9.18 사장님 「날씨 탭도 네이버 지도를 띄워서 날씨 정보를 넣어. 전국 날씨현황을 한눈에」)
-- 시도 17 + 시군구 232 의 좌표·실황을 한 번에. 지도가 줌에 따라 시도/시군구를 골라 그린다(249점이라 한 번에 내려도 가볍다).
create or replace function public.weather_map()
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object('ok', true, 'now', now(),
    'points', coalesce(jsonb_agg(jsonb_build_object(
      'code', r.code, 'name', r.name, 'kind', r.kind, 'parent', r.parent,
      'lat', r.lat, 'lon', r.lon,
      'temp', o.temp, 'precip', o.precip, 'code_wmo', o.code, 'obs_at', o.obs_at,
      'wet', coalesce(s.wet, 0), 'dry', coalesce(s.dry, 0)
    ) order by r.kind desc, r.sort), '[]'::jsonb))
  from weather_regions r
  left join weather_obs o on o.region = r.code
  left join lateral (select count(*) filter (where kind in ('rain','snow')) wet,
                            count(*) filter (where kind = 'none') dry
                       from weather_reports w
                      where w.region = r.code and w.created_at > now() - interval '30 minutes') s on true
  where r.kind in ('sido', 'city') and r.lat is not null;
$$;
grant execute on function public.weather_map() to anon, authenticated;
