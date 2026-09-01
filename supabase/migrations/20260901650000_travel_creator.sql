-- 크리에이터 상세 (2026-09-01) — 사장님: "크리에이터 누르면 나라별 지역별 영상이 나와야"
--
-- '누가 갔나'는 가로 스크롤 몇 장이 끝이라 그 사람이 어디를 얼마나 다녔는지가 안 보인다.
-- 크리에이터를 누르면 **나라 → 지역 → 장소(+그 영상)** 로 펼친다.
-- ⚠️ 장소마다 그 채널의 영상을 붙인다(travel_cover_video 와 같은 규칙) —
--    남의 채널 영상이 붙으면 '이 사람이 여기서 찍은 것'이라는 말이 거짓이 된다.
create or replace function public.travel_creator(p_slug text, p_limit int default 200)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with me as (select auth.uid() u),
  pl as (
    select distinct on (p.id)
           p.id, p.name, p.country, p.country_code, p.scale, p.kind,
           coalesce(p.admin1, p.city) area,
           travel_cover_video(p.id, p_slug) cover,
           ts.video_id, ts.video_title, ts.aired_at,
           exists (select 1 from travel_visits v
                    where v.place_id = p.id and v.user_id = (select u from me)) visited
      from travel_place_sources ts
      join travel_places p on p.id = ts.place_id and p.status = 'live'
     where ts.channel = p_slug
     order by p.id, ts.aired_at desc nulls last
  )
  select jsonb_build_object(
    'ok', true,
    'channel', (select jsonb_build_object(
                  'slug', c.slug, 'name', c.name, 'thumb', c.thumb, 'lang', c.lang,
                  'subs', c.subs,
                  'videos', (select count(*) from travel_videos v where v.channel = c.slug))
                from travel_channels c where c.slug = p_slug),
    'total', (select count(*) from pl),
    'countries', coalesce((
      select jsonb_agg(x order by n desc)
        from (select jsonb_build_object('code', country_code, 'name', min(country),
                                        'n', count(*)) x, count(*) n
                from pl where country_code is not null
               group by country_code) q), '[]'::jsonb),
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'name', name, 'country', country, 'country_code', country_code,
               'area', area, 'scale', scale, 'kind', kind, 'cover', cover,
               'video_id', video_id, 'video_title', video_title, 'aired_at', aired_at,
               'visited', visited)
               order by aired_at desc nulls last)
        from (select * from pl order by aired_at desc nulls last
               limit least(coalesce(p_limit, 200), 400)) z), '[]'::jsonb));
$fn$;
grant execute on function public.travel_creator(text,int) to anon, authenticated;
