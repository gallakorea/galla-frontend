-- 경로에 '도시'를 태운다 (2026-09-01)
--
-- 사장님: "빠니보틀 곽튜브 먼저 수확 돌려서 경로 채워."
-- 그런데 그 두 채널은 메타데이터가 지역 단위다(제목·설명에 상호를 안 쓴다 — 이미 실측).
-- 스팟만 이으면 두 사람의 경로는 영원히 안 그려진다.
--
-- 배낭여행 경로는 원래 **도시에서 도시로** 간다(다카 → 카트만두 → 카불). Polarsteps 도 그렇게 그린다.
-- 그러니 경로의 단위는 스팟이 아니라 '좌표가 뜻을 갖는 모든 지점'이다:
--   spot(가게·명소) · city(도시) · region(섬·지방) → 포함
--   country(나라)                                  → 제외. 좌표가 나라 중심점이라
--                                                    아무도 안 간 들판을 경로가 지나간다.
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
      'kind', p.kind, 'scale', p.scale, 'cover', travel_cover(p.id),
      'video_id', s.video_id, 'video_title', s.video_title, 'aired_at', s.aired_at,
      'n', row_number() over (order by s.first_at, p.created_at)) x,
      row_number() over (order by s.first_at, p.created_at) seq
    from (
      select ts.place_id,
             min(ts.aired_at) first_at,
             (array_agg(ts.video_id    order by ts.aired_at))[1] video_id,
             (array_agg(ts.video_title order by ts.aired_at))[1] video_title,
             min(ts.aired_at) aired_at
        from travel_place_sources ts
       where ts.channel = p_channel
       group by ts.place_id
    ) s
    join travel_places p on p.id = s.place_id
   where p.status = 'live' and p.lat is not null and p.scale <> 'country'
   order by s.first_at, p.created_at
   limit least(coalesce(p_limit, 200), 500)
  ) q;
$fn$;

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
                          and p.status='live' and p.lat is not null and p.scale <> 'country'
     where c.active
     group by c.slug, c.name, c.thumb
    having count(distinct p.id) >= 2
     order by count(distinct p.id) desc
     limit least(coalesce(p_limit, 20), 40)
  ) q;
$fn$;
grant execute on function public.travel_route(text,int)     to anon, authenticated;
grant execute on function public.travel_route_channels(int) to anon, authenticated;
