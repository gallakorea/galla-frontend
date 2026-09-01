-- 여정(trip) 쪼개기 (2026-09-01)
--
-- 사장님: "여행 갔다 온 여정별로 쪼개는 거 해줘."
--
-- 빠니보틀 41점은 6년치 기록이라 한 줄로 이으면 선이 지구를 여러 번 가로지른다.
-- 정직하지만 '한 여행'처럼 보이지 않는다 — Polarsteps 가 여행 단위로 쪼개는 이유다.
--
-- 우리는 여행의 시작·끝을 모른다. 가진 건 영상 방영일뿐이다. 그래서 **공백으로 추론한다**:
--   앞 지점과 21일 이상 벌어지면 다른 여행으로 본다.
--   ⚠️ 방영일은 여행일이 아니다(편집 후 몇 주 뒤에 올린다). 그래서 경계가 정확할 수 없다.
--      21일은 '연재가 끊긴 자리'를 잡는 값이다 — 너무 짧으면 한 여행이 잘게 쪼개지고,
--      너무 길면 유럽 편과 아프리카 편이 한 덩어리가 된다.
--   ⚠️ 방영일이 없는 지점은 앞 여정에 붙인다(끊지 않는다). 끊으면 한 점짜리 여정이 양산된다.
create or replace function public.travel_route(p_channel text, p_limit int default 200,
                                               p_gap_days int default 21)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with base as (
    select p.id, p.name, p.lat, p.lon, p.scale, p.kind,
           coalesce(p.admin1, p.city) city, p.country, p.country_code,
           travel_cover(p.id) cover,
           s.video_id, s.video_title, s.first_at,
           p.created_at
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
     order by s.first_at nulls last, p.created_at
     limit least(coalesce(p_limit, 200), 500)
  ),
  gapped as (
    select b.*,
           case when b.first_at is null or lag(b.first_at) over w is null then 0
                when b.first_at - lag(b.first_at) over w > make_interval(days => greatest(coalesce(p_gap_days,21),1))
                then 1 else 0 end brk
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
    /* ⚠️ 집계(jsonb_agg) 안에서 윈도 함수를 못 쓴다 — 순번은 한 단계 아래에서 매긴다. */
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
      select jsonb_agg(x order by trip desc)     -- 최근 여행이 위로
      from (
        select jsonb_build_object(
          'trip', t.trip,
          'n', count(*),
          'from', min(t.first_at), 'to', max(t.first_at),
          /* 라벨: 그 여정에서 가장 많이 나온 나라 두 개. '유럽 편' 같은 이름은 우리가 지어낼 수 없다. */
          'countries', (select jsonb_agg(c) from (
             select t2.country c from trips t2
              where t2.trip = t.trip and t2.country is not null
              group by t2.country order by count(*) desc limit 2) z)
          ) x, t.trip
        from trips t group by t.trip
      ) q), '[]'::jsonb));
$fn$;
grant execute on function public.travel_route(text,int,int) to anon, authenticated;
