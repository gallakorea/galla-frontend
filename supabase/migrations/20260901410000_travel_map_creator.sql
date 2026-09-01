-- 지도 핀에 '누가 갔는지'를 싣는다 (2026-09-01)
-- 사장님: "지도상에서 그 여행 크리에이터가 간 곳을 맛집처럼 정확히 찍어."
-- 맛집 지도의 핀이 채널 로고인 이유와 같다 — 핀만 봐도 누가 다녀온 곳인지 알아야 한다.
-- ⚠️ 한 곳을 여러 크리에이터가 갔을 수 있다. 핀은 하나여야 하므로 **가장 최근에 다녀간
--    크리에이터**의 로고를 쓰고, 나머지는 상세에서 보여준다.
create or replace function public.travel_map(p_south numeric, p_west numeric,
                                             p_north numeric, p_east numeric,
                                             p_limit int default 300)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', true, 'places', coalesce(jsonb_agg(x), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'lat', p.lat, 'lon', p.lon,
      'scale', p.scale, 'kind', p.kind, 'city', p.city, 'country', p.country,
      'cover', travel_cover(p.id),
      'ch_name', ch.name, 'ch_thumb', ch.thumb, 'ch_n', ch.n) x
    from (
      select p.*, row_number() over (
               partition by round(p.lat::numeric, 0), round(p.lon::numeric, 0)
               order by (p.photo is null), p.created_at desc) rn
        from travel_places p
       where p.status = 'live' and p.lat is not null
         and p.lat between p_south and p_north
         and p.lon between p_west  and p_east
    ) p
    left join lateral (
      select c.name, c.thumb,
             (select count(distinct ts2.channel) from travel_place_sources ts2 where ts2.place_id = p.id) n
        from travel_place_sources ts
        join travel_channels c on c.slug = ts.channel
       where ts.place_id = p.id
       order by ts.aired_at desc nulls last
       limit 1
    ) ch on true
    where p.rn <= 8
    order by p.rn
    limit least(coalesce(p_limit, 300), 800)
  ) q;
$fn$;
grant execute on function public.travel_map(numeric,numeric,numeric,numeric,int) to anon, authenticated;
