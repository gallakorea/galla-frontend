-- 인증을 화면에 태운다 (2026-09-01)
-- 카드·상세·대시보드에서 뱃지로 보인다. 인증만 모아보는 길도 연다.

/* 장소 상세에 인증 붙이기 */
create or replace function public.travel_place_info(p_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with me as (select auth.uid() u)
  select jsonb_build_object('ok', p.id is not null,
    'place', jsonb_build_object(
      'id', p.id, 'name', p.name, 'name_local', p.name_local, 'name_en', p.name_en,
      'city', coalesce(p.admin1, p.city), 'country', p.country, 'country_code', p.country_code,
      'address', p.address, 'lat', p.lat, 'lon', p.lon,
      'scale', p.scale, 'kind', p.kind, 'category', p.category, 'status', p.status,
      'cover', travel_cover(p.id), 'photo_credit', p.photo_credit,
      'geo_source', p.geo_source, 'wikidata_qid', p.wikidata_qid,
      'summary', p.summary, 'summary_src', p.summary_src, 'summary_url', p.summary_url,
      'certs', coalesce((select jsonb_agg(jsonb_build_object(
                            'code', d.code, 'name', d.name, 'emoji', d.emoji, 'blurb', d.blurb)
                            order by d.sort)
                          from travel_certs tc join travel_cert_defs d on d.code = tc.code
                         where tc.place_id = p.id), '[]'::jsonb)),
    'stats', jsonb_build_object(
      'again', coalesce(s.again,0), 'once', coalesce(s.once,0),
      'want', coalesce(s.want,0), 'comments', coalesce(s.comments,0),
      'heat', round(coalesce(s.heat,0),2), 'hype', round(coalesce(s.hype,0),2)),
    'mine', (select v.verdict from travel_votes v
              where v.place_id = p.id and v.user_id = (select u from me)),
    'saved', exists (select 1 from travel_saves sv
                      where sv.place_id = p.id and sv.user_id = (select u from me)),
    'videos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'video_id', ts.video_id, 'title', ts.video_title,
               'channel', c.name, 'channel_slug', c.slug, 'thumb', c.thumb,
               'aired_at', ts.aired_at) order by ts.aired_at desc nulls last)
        from travel_place_sources ts
        join travel_channels c on c.slug = ts.channel
       where ts.place_id = p.id and ts.video_id is not null), '[]'::jsonb))
  from travel_places p
  left join travel_stats s on s.place_id = p.id
  where p.id = p_id and p.status in ('live','pending');
$fn$;

/* 피드 카드에도 인증 코드를 실어 보낸다(뱃지 한 개만 보여줄 거라 코드 배열이면 충분) */
create or replace function public.travel_feed(p_scale text default null,
                                              p_country text default null,
                                              p_kind text default null,
                                              p_limit int default 30,
                                              p_offset int default 0,
                                              p_area text default null,
                                              p_cert text default null)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with me as (select auth.uid() u)
  select jsonb_build_object('ok', true, 'places', coalesce(jsonb_agg(x order by ord, id_txt), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'name_en', p.name_en,
      'admin1', p.admin1, 'city', p.city,
      'country', p.country, 'country_code', p.country_code,
      'scale', p.scale, 'kind', p.kind, 'category', p.category,
      'lat', p.lat, 'lon', p.lon,
      'cover', travel_cover(p.id), 'photo_credit', p.photo_credit,
      'geo_source', p.geo_source,
      'certs', coalesce((select jsonb_agg(d.emoji order by d.sort)
                           from travel_certs tc join travel_cert_defs d on d.code = tc.code
                          where tc.place_id = p.id), '[]'::jsonb),
      'again', coalesce(s.again,0), 'once', coalesce(s.once,0),
      'want', coalesce(s.want,0), 'pass', coalesce(s.pass,0),
      'mine', (select v.verdict from travel_votes v
                where v.place_id = p.id and v.user_id = (select u from me)),
      'channels', coalesce((select jsonb_agg(distinct c.name)
                             from travel_place_sources ts
                             join travel_channels c on c.slug = ts.channel
                            where ts.place_id = p.id), '[]'::jsonb)) x,
      (case when p.photo is not null then 0 else 1 end) ord,
      p.id::text id_txt
    from travel_places p
    left join travel_stats s on s.place_id = p.id
    where p.status = 'live'
      and (p_scale is null or p.scale = p_scale)
      and (p_country is null or p.country_code = upper(p_country))
      and (p_kind is null or p.kind = p_kind)
      and (p_area is null or coalesce(nullif(btrim(p.admin1),''), nullif(btrim(p.city),'')) = p_area)
      and (p_cert is null or exists (select 1 from travel_certs tc
                                      where tc.place_id = p.id and tc.code = p_cert))
    order by (case when p.photo is not null then 0 else 1 end), p.created_at desc
    limit least(coalesce(p_limit, 30), 60) offset greatest(coalesce(p_offset, 0), 0)
  ) q;
$fn$;
-- ⚠️ 시그니처가 바뀌었다. 옛 6인자 함수를 반드시 지운다(안 지우면 PostgREST 가 못 고른다).
drop function if exists public.travel_feed(text, text, text, integer, integer, text);
grant execute on function public.travel_feed(text,text,text,int,int,text,text) to anon, authenticated;

/* 대시보드에 인증 탭 하나 추가 — 사장님이 말한 '미슐랭' 자리다. */
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
    /* 🏛 인증 — 크리에이터가 다녀간 인증 여행지를 먼저 보여준다(그게 우리 화면의 맥락이다). */
    'certs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'name', s.name, 'country', s.country, 'country_code', s.country_code,
               'area', s.area, 'cover', s.cover, 'emoji', d.emoji, 'cert', d.name, 'n', s.chn)
               order by s.chn desc, s.last_at desc nulls last)
        from (select * from spots) s
        join travel_certs tc on tc.place_id = s.id
        join travel_cert_defs d on d.code = tc.code
       limit least(coalesce(p_n,8), 20)), '[]'::jsonb),
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
