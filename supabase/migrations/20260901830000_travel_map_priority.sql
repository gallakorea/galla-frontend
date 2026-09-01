-- 지도 핀 우선순위 (2026-09-01)
-- 인증 4,600곳이 들어오자 화면의 84%가 유산 핀이 됐다(300개 중 252개 실측).
-- 그러면 이 탭의 주인공인 **크리에이터 발자국이 파묻힌다**.
-- → 격자 셀 안에서 크리에이터가 다녀간 곳을 먼저 남긴다. 유산은 그 다음이다.
--   (유산을 빼지는 않는다 — 크리에이터가 없는 지역에선 유산이 유일한 볼거리다.)
create or replace function public.travel_map(p_south numeric, p_west numeric,
                                             p_north numeric, p_east numeric,
                                             p_limit int default 300)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', true, 'places', coalesce(jsonb_agg(x), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'lat', p.lat, 'lon', p.lon,
      'scale', p.scale, 'kind', p.kind, 'city', coalesce(p.admin1, p.city),
      'country', p.country, 'country_code', p.country_code,
      'cover', travel_cover(p.id),
      'cert', (select d.emoji from travel_certs tc
                 join travel_cert_defs d on d.code = tc.code
                where tc.place_id = p.id order by d.sort limit 1),
      'ch_name', ch.name, 'ch_thumb', ch.thumb, 'ch_n', ch.n) x
    from (
      select p.*,
             row_number() over (
               partition by round(p.lat::numeric, 0), round(p.lon::numeric, 0)
               order by (p.origin <> 'yt'),        -- 크리에이터가 만든 행 먼저
                        (p.photo is null),
                        p.created_at desc) rn
        from travel_places p
       where p.status = 'live' and p.lat is not null
         and p.scale in ('spot','city')
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
    order by (ch.thumb is null), p.rn      -- 300개로 자를 때도 크리에이터 핀이 먼저 살아남는다
    limit least(coalesce(p_limit, 300), 800)
  ) q;
$fn$;
