-- 대시보드에 검색 트렌드 얹기 (2026-09-01)
-- 사장님: "최근 다녀간 곳은 의미 없을 듯" → 그 탭을 **지금 검색 뜨는 여행지**로 바꾼다.
-- (recent 는 RPC 에 남겨둔다 — 나중에 쓸 자리가 생길 수 있고, 지우면 되돌리기가 번거롭다.)
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
    /* 🔥 지금 검색 뜨는 여행지 — 네이버 데이터랩 검색어트렌드(앵커 정규화) */
    'trend', (select coalesce((travel_trend_top(p_n, 3))->'items', '[]'::jsonb)),
    'trend_period', (select (travel_trend_top(1, 0))->>'period'),
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

-- 검색 트렌드는 월 단위라 하루 한 번이면 충분하다.
select cron.unschedule('travel_trends_job') where exists (select 1 from cron.job where jobname='travel_trends_job');
select cron.schedule('travel_trends_job', '50 3 * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/collect-travel-trends?batches=10',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
