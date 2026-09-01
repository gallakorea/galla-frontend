-- 크리에이터 여정 경로 (2026-09-01) — Polarsteps 식 선 긋기
--
-- 새로 수집할 게 없다. travel_place_sources 에 (채널, 영상, 방영일)이 이미 있고
-- 장소엔 좌표가 있다. 방영 순서대로 이으면 그게 그 사람의 여정이다.
--
-- ⚠️ 좌표 없는 장소(pending)는 선에 못 올린다 — 선이 0,0 으로 튄다.
-- ⚠️ 같은 장소를 여러 영상에서 갔으면 **처음 간 때**로 한 번만 찍는다.
--    안 그러면 선이 같은 점을 왕복하며 스파게티가 된다.
-- ⚠️ 나라·광역 행은 뺀다. 좌표가 나라 중심점이라 경로가 엉뚱한 들판을 지난다.
create or replace function public.travel_route(p_channel text, p_limit int default 200)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object(
    'ok', true,
    'channel', p_channel,
    'name', (select c.name from travel_channels c where c.slug = p_channel),
    'thumb', (select c.thumb from travel_channels c where c.slug = p_channel),
    'steps', coalesce(jsonb_agg(x order by seq), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'lat', p.lat, 'lon', p.lon,
      'city', coalesce(p.admin1, p.city), 'country', p.country, 'country_code', p.country_code,
      'kind', p.kind, 'cover', travel_cover(p.id),
      'video_id', s.video_id, 'video_title', s.video_title, 'aired_at', s.aired_at,
      'n', row_number() over (order by s.first_at, p.created_at)) x,
      row_number() over (order by s.first_at, p.created_at) seq
    from (
      select ts.place_id,
             min(ts.aired_at) first_at,
             (array_agg(ts.video_id     order by ts.aired_at))[1] video_id,
             (array_agg(ts.video_title  order by ts.aired_at))[1] video_title,
             min(ts.aired_at) aired_at
        from travel_place_sources ts
       where ts.channel = p_channel
       group by ts.place_id
    ) s
    join travel_places p on p.id = s.place_id
   where p.status = 'live' and p.lat is not null and p.scale = 'spot'
   order by s.first_at, p.created_at
   limit least(coalesce(p_limit, 200), 500)
  ) q;
$fn$;

/* 경로를 그릴 만한 크리에이터 — 점이 둘 이상이어야 선이 된다. */
create or replace function public.travel_route_channels(p_limit int default 20)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', true, 'channels', coalesce(jsonb_agg(x order by n desc), '[]'::jsonb))
  from (
    select jsonb_build_object('slug', c.slug, 'name', c.name, 'thumb', c.thumb,
                              'n', count(distinct p.id)) x,
           count(distinct p.id) n
      from travel_channels c
      join travel_place_sources ts on ts.channel = c.slug
      join travel_places p on p.id = ts.place_id
                          and p.status='live' and p.lat is not null and p.scale='spot'
     where c.active
     group by c.slug, c.name, c.thumb
    having count(distinct p.id) >= 2
     order by count(distinct p.id) desc
     limit least(coalesce(p_limit, 20), 40)
  ) q;
$fn$;

grant execute on function public.travel_route(text,int)      to anon, authenticated;
grant execute on function public.travel_route_channels(int)  to anon, authenticated;
