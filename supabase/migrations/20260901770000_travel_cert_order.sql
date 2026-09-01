-- 인증 탭 정렬 (2026-09-01)
-- ⚠️ jsonb_agg 안의 order by 만 있고 서브쿼리에 order 가 없어 아무 순서로 20개가 잘렸다.
--    그래서 한국어 이름도 사진도 없는 항목(Germania Military Cemetery)이 앞에 떴다.
-- 우선순위: ① 크리에이터가 다녀간 곳 ② 사진 있는 곳 ③ 한국어 이름인 곳.
--   우리 화면의 맥락은 '크리에이터가 간 곳'이고, 인증은 그 위에 얹는 뱃지이기 때문이다.
create or replace function public.travel_dashboard(p_n int default 8)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with spots as (
    select p.id, p.name, p.country, p.country_code,
           coalesce(p.admin1, p.city) area, p.photo, travel_cover(p.id) cover,
           (select count(distinct ts.channel) from travel_place_sources ts where ts.place_id = p.id) chn,
           (select max(ts.aired_at) from travel_place_sources ts where ts.place_id = p.id) last_at
      from travel_places p
     where p.status = 'live' and p.scale = 'spot'
  )
  select jsonb_build_object(
    'ok', true,
    'totals', jsonb_build_object(
      'places',    (select count(*) from travel_places where status='live' and scale='spot'),
      'countries', (select count(distinct country_code) from travel_places
                     where status='live' and country_code is not null),
      'creators',  (select count(*) from travel_channels where active and yt_channel_id is not null),
      'videos',    (select count(*) from travel_videos),
      'certs',     (select count(*) from travel_certs)),
    'multi', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'name', name, 'country', country, 'country_code', country_code,
               'area', area, 'cover', cover, 'n', chn) order by chn desc, last_at desc nulls last)
        from (select * from spots where chn >= 2 order by chn desc, last_at desc nulls last
               limit least(coalesce(p_n,8), 20)) a), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'name', name, 'country', country, 'country_code', country_code,
               'area', area, 'cover', cover, 'at', last_at) order by last_at desc)
        from (select * from spots where last_at is not null
               order by last_at desc limit least(coalesce(p_n,8), 20)) b), '[]'::jsonb),
    'certs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'name', name, 'country', country, 'country_code', country_code,
               'area', area, 'cover', cover, 'emoji', emoji, 'cert', cert, 'n', chn)
               order by rk)
        from (
          select s.*, d.emoji, d.name cert,
                 row_number() over (order by (s.chn = 0), (s.cover is null),
                                             (s.name !~ '[가-힣]'), s.chn desc) rk
            from spots s
            join travel_certs tc on tc.place_id = s.id
            join travel_cert_defs d on d.code = tc.code
        ) z
       where rk <= least(coalesce(p_n,8), 20)), '[]'::jsonb),
    'countries', coalesce((
      select jsonb_agg(jsonb_build_object('code', code, 'name', nm, 'n', n, 'chn', chn)
                       order by n desc)
        from (select s.country_code code, min(s.country) nm, count(*) n,
                     count(distinct ts.channel) chn
                from spots s join travel_place_sources ts on ts.place_id = s.id
               where s.country_code is not null
               group by s.country_code order by count(*) desc
               limit least(coalesce(p_n,8), 20)) c), '[]'::jsonb));
$fn$;
