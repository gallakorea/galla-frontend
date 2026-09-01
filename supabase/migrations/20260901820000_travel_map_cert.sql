-- 지도 핀에 인증 마크 (2026-09-01)
-- 사장님: "지도에서 유산이면 유산 마크를 써야지 GALLA 빈 마크는 안 된다."
--
-- 인증으로 들어온 장소(유네스코·국보·보물…)는 크리에이터 로고가 없다. 그때 사진으로 떨어지는데,
-- 사진이 없거나 깨지면 서비스워커의 기본 이미지(GALLA 로고)가 대신 뜬다 — 아무 뜻도 없는 핀이다.
-- → 핀 얼굴 순서를 정한다: 크리에이터 로고 > **인증 마크** > 장소 사진 > 국기.
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
      select p.*, row_number() over (
               partition by round(p.lat::numeric, 0), round(p.lon::numeric, 0)
               order by (p.photo is null), p.created_at desc) rn
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
    order by p.rn
    limit least(coalesce(p_limit, 300), 800)
  ) q;
$fn$;
