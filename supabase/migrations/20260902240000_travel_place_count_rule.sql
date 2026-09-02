-- 크리에이터가 '몇 곳' 갔는지가 화면마다 달랐다 (2026-09-02)
--
-- 사장님: "빠니 왜 아직 숫자 이래?" 목록엔 37곳, 크리에이터 페이지엔 164곳이 떴다.
-- 세는 기준이 서로 달랐고, **둘 다 틀렸다.** 빠니보틀 164곳의 실제 구성:
--     country 53 · region 29 · city 45 · spot 37
--   · travel_browse   는 scale='spot' 만 세서 도시 45곳(카이로·도쿄…)을 통째로 빼먹었다
--   · travel_creator  는 전부 세서 **나라 53개와 도 29개를 '장소'로 계산**했다
--     (사장님 화면의 '르완다 1곳', '우간다 1곳' 이 그것이다 — 나라를 장소라고 우긴 셈이다)
--
-- 맞는 숫자는 **spot + city = 82곳**. 실제로 갈 수 있는 목적지만 센다.
-- 나라·도는 위쪽 나라 칩이 이미 보여주므로 목록에서 빠져도 잃는 정보가 없다.
-- ⚠️ 색인 대상(travel_sitemap_v)과 같은 기준이다 — 한 서비스 안에서 '장소'의 정의가
--    화면마다 다르면 어떤 숫자도 믿을 수 없게 된다.
CREATE OR REPLACE FUNCTION public.travel_browse(p_per integer DEFAULT 10, p_channels integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() u),
  ch as (
    select c.slug, c.name, c.thumb, c.lang, c.subs,
           count(distinct p.id) total,
           count(distinct p.id) filter (
             where exists (select 1 from travel_visits v
                            where v.place_id = p.id and v.user_id = (select u from me))) mine
      from travel_channels c
      join travel_place_sources ts on ts.channel = c.slug
      join travel_places p on p.id = ts.place_id and p.status = 'live'
                            and p.scale in ('spot','city')
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
$function$
;

CREATE OR REPLACE FUNCTION public.travel_creator(p_slug text, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                            and p.scale in ('spot','city')
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
$function$
;
