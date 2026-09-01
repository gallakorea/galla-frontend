-- 동선 고도화 + 한국 채널 우선 (2026-09-01)
--
-- 사장님 ①: "구독자 순으로" → 했더니 해외 채널(Mark Wiens 1,190만)이 앞을 다 차지했다.
--   한국 서비스다. **한국 채널 먼저, 그 안에서 구독자 순**, 해외는 뒤로.
-- 사장님 ②: "크리에이터별 여행 동선이 뒤죽박죽. 같은 일본이라도 날짜로 선별해서 동선을 짜라."
--   원인이 둘이다:
--     ⓐ 여정을 방영일 공백(21일)으로만 끊었다. 크리에이터는 A나라 연재 중에 B나라 단편을
--        끼워 올린다 — 그러면 한 여정 안에서 선이 대륙을 넘나든다.
--     ⓑ 한 영상에서 뽑은 여러 장소는 방영일이 같아서 그들 사이 순서가 아무렇게나 정해진다.
--   → ⓐ는 여기서 고친다: **공백이 크거나, 직전 점에서 지리적으로 멀리 튀면** 여정을 끊는다.
--     ⓑ는 화면에서 고친다(같은 날짜 묶음을 직전 점에서 가까운 순으로 재배열).

/* 두 점 사이 거리(km) — 하버사인. earthdistance 확장에 기대지 않는다(설치 여부에 좌우되면 안 된다). */
create or replace function public.travel_km(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric)
returns numeric language sql immutable as $fn$
  select case when lat1 is null or lat2 is null then null else
    6371 * 2 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lon2 - lon1) / 2), 2)))::numeric
  end;
$fn$;

create or replace function public.travel_route(p_channel text, p_limit int default 200,
                                               p_gap_days int default 21)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
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
     order by s.first_at nulls last, p.created_at
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
$fn$;

/* 크리에이터 정렬 — 한국 채널 먼저(lang='ko'), 그 안에서 구독자 순. */
create or replace function public.travel_route_channels(p_limit int default 20)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', true, 'channels',
    coalesce(jsonb_agg(x order by thin, foreign_ch, subs desc nulls last, n desc), '[]'::jsonb))
  from (
    select jsonb_build_object('slug', c.slug, 'name', c.name, 'thumb', c.thumb,
                              'n', count(distinct p.id), 'subs', c.subs) x,
           count(distinct p.id) n, c.subs,
           (count(distinct p.id) >= 3) is not true thin,      -- 점 3개 미만은 뒤로
           (c.lang is distinct from 'ko') foreign_ch          -- 한국 채널 먼저
      from travel_channels c
      join travel_place_sources ts on ts.channel = c.slug
      join travel_places p on p.id = ts.place_id
                          and p.status='live' and p.lat is not null and p.scale <> 'country'
     where c.active
     group by c.slug, c.name, c.thumb, c.subs, c.lang
    having count(distinct p.id) >= 2
     limit least(coalesce(p_limit, 20), 40)
  ) q;
$fn$;

create or replace function public.travel_browse(p_per int default 10, p_channels int default 12)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with me as (select auth.uid() u),
  ch as (
    select c.slug, c.name, c.thumb, c.lang, c.subs,
           count(distinct p.id) total,
           count(distinct p.id) filter (
             where exists (select 1 from travel_visits v
                            where v.place_id = p.id and v.user_id = (select u from me))) mine
      from travel_channels c
      join travel_place_sources ts on ts.channel = c.slug
      join travel_places p on p.id = ts.place_id and p.status = 'live' and p.scale = 'spot'
     where c.active
     group by c.slug, c.name, c.thumb, c.lang, c.subs
    having count(distinct p.id) > 0
     order by (c.lang is distinct from 'ko'), c.subs desc nulls last, count(distinct p.id) desc
     limit least(coalesce(p_channels, 12), 30)
  )
  select jsonb_build_object('ok', true, 'sections',
    coalesce(jsonb_agg(jsonb_build_object(
      'slug', ch.slug, 'name', ch.name, 'thumb', ch.thumb, 'lang', ch.lang,
      'subs', ch.subs, 'total', ch.total, 'visited', ch.mine,
      'pct', case when ch.total > 0 then round(ch.mine::numeric * 100 / ch.total) else 0 end,
      'places', coalesce(pl.arr, '[]'::jsonb)
    ) order by (ch.lang is distinct from 'ko'), ch.subs desc nulls last, ch.total desc), '[]'::jsonb))
  from ch
  left join lateral (
    select jsonb_agg(x order by created_at desc) arr from (
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'city', coalesce(p.admin1, p.city), 'country', p.country,
        'country_code', p.country_code, 'scale', p.scale, 'kind', p.kind,
        'cover', travel_cover_video(p.id, ch.slug),
        'visited', exists (select 1 from travel_visits v
                            where v.place_id = p.id and v.user_id = (select u from me))) x,
        p.created_at
      from (
        select distinct p2.* from travel_place_sources ts2
          join travel_places p2 on p2.id = ts2.place_id
                               and p2.status = 'live' and p2.scale = 'spot'
         where ts2.channel = ch.slug
      ) p
      order by p.created_at desc
      limit least(coalesce(p_per, 10), 30)
    ) q
  ) pl on true;
$fn$;
grant execute on function public.travel_km(numeric,numeric,numeric,numeric) to anon, authenticated;
