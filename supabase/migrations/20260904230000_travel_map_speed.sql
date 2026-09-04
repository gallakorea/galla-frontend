-- 지도도 행마다 따로 묻던 걸 집합 연산으로 바꾼다
--
-- 원인은 대시보드와 같다. 화면에 보이는 범위의 장소마다
--   · travel_cover(p.id)                                (함수 호출)
--   · (select emoji from travel_certs ... where place_id=p.id)
--   · (select count(distinct channel) from travel_place_sources where place_id=p.id)
-- 를 각각 돌렸다. 국내 화면 하나에 4,000곳이 잡히면 그만큼 반복된다.
-- 실측 2026-09-04: 3.4초로 anon 제한(3초)을 넘겨 지도가 통째로 안 떴다.
--
-- 고침: 범위 안 후보를 먼저 좁히고(rn<=8), 채널 집계는 한 번의 group by 로,
-- 커버·인증은 **최종 300행에만** 구한다.
--
-- ⚠️ p_min_subs 는 원래 '구독자 N 이상인 채널이 하나라도 있나'였다.
--    top 은 구독자가 가장 많은 채널이므로 top.subs >= N 과 같은 뜻이다(최댓값 ≥ N ⟺ 하나라도 ≥ N).
create or replace function public.travel_map(
  p_south numeric, p_west numeric, p_north numeric, p_east numeric,
  p_limit integer default 300, p_min_subs bigint default null)
returns jsonb language sql stable security definer set search_path to 'public' as $BODY$
  with base as (
    select p.id, p.name, p.lat, p.lon, p.scale, p.kind,
           coalesce(p.admin1, p.city) city, p.country, p.country_code, p.rn
      from (
        select p.*,
               row_number() over (
                 partition by round(p.lat::numeric, 0), round(p.lon::numeric, 0)
                 order by (p.origin <> 'yt'), (p.photo is null), p.created_at desc) rn
          from travel_places p
         where p.status = 'live' and p.lat is not null
           and p.scale in ('spot','city')
           and p.lat between p_south and p_north
           and p.lon between p_west  and p_east
      ) p
     where p.rn <= 8
  ), agg as (
    select ts.place_id, count(distinct ts.channel)::int n
      from travel_place_sources ts
      join base b on b.id = ts.place_id
     group by ts.place_id
  ), top as (
    select distinct on (ts.place_id)
           ts.place_id, c.name, c.thumb, c.subs
      from travel_place_sources ts
      join base b on b.id = ts.place_id
      join travel_channels c on c.slug = ts.channel
     order by ts.place_id, c.subs desc nulls last, ts.aired_at desc nulls last
  ), sel as (
    select b.*, t.name ch_name, t.thumb ch_thumb, t.subs ch_subs, coalesce(a.n, 0) ch_n
      from base b
      left join agg a on a.place_id = b.id
      left join top t on t.place_id = b.id
     where p_min_subs is null or coalesce(t.subs, 0) >= p_min_subs
     order by (t.thumb is null), b.rn
     limit least(coalesce(p_limit, 300), 800)
  )
  select jsonb_build_object('ok', true, 'places', coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'lat', s.lat, 'lon', s.lon,
      'scale', s.scale, 'kind', s.kind, 'city', s.city,
      'country', s.country, 'country_code', s.country_code,
      'cover', travel_cover(s.id),
      'cert', (select d.emoji from travel_certs tc
                 join travel_cert_defs d on d.code = tc.code
                where tc.place_id = s.id order by d.sort limit 1),
      'ch_name', s.ch_name, 'ch_thumb', s.ch_thumb, 'ch_n', s.ch_n, 'ch_subs', s.ch_subs)), '[]'::jsonb))
  from sel s;
$BODY$;

grant execute on function public.travel_map(numeric,numeric,numeric,numeric,integer,bigint)
  to anon, authenticated, service_role;
