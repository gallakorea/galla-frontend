-- 여행 경로: 오래된 200곳이 아니라 최신 200곳을 잇는다(최신 여정 누락 수정)
CREATE OR REPLACE FUNCTION public.travel_route(p_channel text, p_limit integer DEFAULT 200, p_gap_days integer DEFAULT 21)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with base as (
    select p.id, p.name, p.lat, p.lon, p.scale, p.kind,
           coalesce(p.admin1, p.city) city, p.country, p.country_code,
           travel_cover(p.id) cover,
           s.video_id, s.video_title, s.first_at, p.created_at
      from (
        select ts.place_id,
               min(ts.aired_at) first_at,
               (array_agg(ts.video_id    order by ts.aired_at))[1] video_id,
               (array_agg(ts.video_title order by ts.aired_at))[1] video_title
          from travel_place_sources ts
         where ts.channel = p_channel
         group by ts.place_id
      ) s
      join travel_places p on p.id = s.place_id
     where p.status = 'live' and p.lat is not null and p.scale <> 'country'
     /* 🔴 최신 N곳을 받는다. 예전엔 오래된 순 앞 200곳이라 곽튜브(213곳)의 2026년 여정 13곳이 통째로
        잘려 가장 최근 여행이 경로에 안 보였다(26.9.18 사장님 「이 경로가 맞나?」 확인 중 발견).
        뒤 단계(창·정렬)는 모두 first_at 오름차순으로 다시 세우므로 여기 순서는 '무엇을 자를지'만 정한다. */
     order by s.first_at desc nulls last, p.created_at desc
     limit least(coalesce(p_limit, 200), 500)
  ),
  gapped as (
    select b.*,
           case
             when b.first_at is null or lag(b.first_at) over w is null then 0
             /* 연재가 끊긴 자리 */
             when b.first_at - lag(b.first_at) over w
                  > make_interval(days => greatest(coalesce(p_gap_days,21),1)) then 1
             /* 지리적 점프 — 대륙을 건너뛰면 같은 여정으로 이을 이유가 없다.
                ⚠️ 기준을 1,200km 로 잡았더니 카이로→이스탄불(약 1,200km)처럼 **한 여행에서
                   흔한 이동**까지 끊겨 41점이 30여정으로 조각났다(실측). 실제 여행 감각에 맞춘다:
                   나라가 바뀌어도 2,500km 까지는 한 여행, 같은 나라 안은 4,000km 까지 한 여행
                   (미국·러시아·호주는 국내 이동도 멀다). 그 위는 대륙 이동으로 본다. */
             when travel_km(lag(b.lat) over w, lag(b.lon) over w, b.lat, b.lon)
                  > (case when b.country_code is distinct from lag(b.country_code) over w
                          then 2500 else 4000 end) then 1
             else 0 end brk
      from base b
    window w as (order by b.first_at nulls last, b.created_at)
  ),
  trips as (
    select g.*,
           1 + sum(g.brk) over (order by g.first_at nulls last, g.created_at
                                rows between unbounded preceding and current row) trip
      from gapped g
  )
  select jsonb_build_object(
    'ok', true,
    'channel', p_channel,
    'name',  (select c.name  from travel_channels c where c.slug = p_channel),
    'thumb', (select c.thumb from travel_channels c where c.slug = p_channel),
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', z.id, 'name', z.name, 'lat', z.lat, 'lon', z.lon,
        'city', z.city, 'country', z.country, 'country_code', z.country_code,
        'kind', z.kind, 'scale', z.scale, 'cover', z.cover,
        'video_id', z.video_id, 'video_title', z.video_title, 'aired_at', z.first_at,
        'trip', z.trip, 'n', z.n)
        order by z.trip, z.first_at nulls last, z.created_at)
      from (
        select t.*, row_number() over (partition by t.trip
                                       order by t.first_at nulls last, t.created_at) n
          from trips t
      ) z), '[]'::jsonb),
    'trips', coalesce((
      select jsonb_agg(x order by trip desc)
      from (
        select jsonb_build_object(
          'trip', t.trip, 'n', count(*),
          'from', min(t.first_at), 'to', max(t.first_at),
          'countries', (select jsonb_agg(c) from (
             select t2.country c from trips t2
              where t2.trip = t.trip and t2.country is not null
              group by t2.country order by count(*) desc limit 2) z)
          ) x, t.trip
        from trips t group by t.trip
      ) q), '[]'::jsonb));
$function$;
