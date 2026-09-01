-- 지도 구독자 필터 (2026-09-01) — 사장님: "필터를 넣자. 팔로워 수로 단위를 선택할 수 있게."
--
-- 채널이 86개라 지도가 붐빈다. "100만 이상만 보기"처럼 크기로 걸러야 화면이 읽힌다.
-- ⚠️ 임계값을 걸면 **인증(유산) 핀은 뺀다**. 유산엔 구독자가 없으니 남겨두면
--    "100만+" 를 골랐는데 화면이 유산으로 가득 차는 이상한 결과가 된다.
-- ⚠️ 시그니처가 바뀌므로 옛 5인자 함수를 반드시 지운다(PostgREST 오버로드 함정 — 이미 두 번 밟았다).
create or replace function public.travel_map(p_south numeric, p_west numeric,
                                             p_north numeric, p_east numeric,
                                             p_limit int default 300,
                                             p_min_subs bigint default null)
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
      'ch_name', ch.name, 'ch_thumb', ch.thumb, 'ch_n', ch.n, 'ch_subs', ch.subs) x
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
         and (p_min_subs is null or exists (
               select 1 from travel_place_sources ts
                 join travel_channels c on c.slug = ts.channel
                where ts.place_id = p.id and coalesce(c.subs, 0) >= p_min_subs))
    ) p
    left join lateral (
      /* 그 장소를 다녀간 채널 중 **가장 큰 채널**을 핀 얼굴로 쓴다.
         작은 채널 로고가 대표로 걸리면 필터를 건 뜻이 흐려진다. */
      select c.name, c.thumb, c.subs,
             (select count(distinct ts2.channel) from travel_place_sources ts2 where ts2.place_id = p.id) n
        from travel_place_sources ts
        join travel_channels c on c.slug = ts.channel
       where ts.place_id = p.id
       order by c.subs desc nulls last, ts.aired_at desc nulls last
       limit 1
    ) ch on true
    where p.rn <= 8
    order by (ch.thumb is null), p.rn
    limit least(coalesce(p_limit, 300), 800)
  ) q;
$fn$;
drop function if exists public.travel_map(numeric, numeric, numeric, numeric, integer);
grant execute on function public.travel_map(numeric,numeric,numeric,numeric,int,bigint) to anon, authenticated;
