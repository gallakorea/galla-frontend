-- 여행 크리에이터 페이지의 장소 목록을 나라별·페이지 단위로 받는다(2026-09-11 QA 7-7-4).
-- 문제: 페이지가 travel_creator(slug, 200) 한 번만 부르고 「더 보기」가 없어, 200곳 넘는 채널은 목록이 잘렸다.
--       헤더 total·나라 칩 n 은 전체 기준인데 칩을 누르면 받아 둔 최신 200곳 안에서만 걸렀다.
--       실측: 93명 중 33명(35%)이 200곳 초과. Mark Wiens 헤더 2,422곳 / 목록 200곳, 칩 태국 393 → 목록 11,
--       칩 79개 중 55개가 빈 목록.
-- 수정: travel_creator 는 그대로 두고(설치된 앱 호환·권한 유지) 목록 전용 함수를 따로 둔다.
--       같은 pl 조건(live · spot/city · 장소 단위), 순서는 방송일 최신 → id(동률에도 페이지가 흔들리지 않게).
--       표지·방문 여부는 **돌려줄 페이지 행에만** 계산한다(큰 채널 전체에 매번 돌리지 않게).
create or replace function public.travel_creator_places(
  p_slug text, p_country text default null, p_limit integer default 60, p_offset integer default 0)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with me as (select auth.uid() u),
  pl as (
    select distinct on (p.id)
           p.id, p.name, p.country, p.country_code, p.scale, p.kind,
           coalesce(p.admin1, p.city) area,
           ts.video_id, ts.video_title, ts.aired_at
      from travel_place_sources ts
      join travel_places p on p.id = ts.place_id and p.status = 'live'
                            and p.scale in ('spot','city')
     where ts.channel = p_slug
     order by p.id, ts.aired_at desc nulls last
  ),
  f as (select * from pl where p_country is null or country_code = p_country),
  pg as (
    select * from f
     order by aired_at desc nulls last, id
     limit least(greatest(coalesce(p_limit, 60), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'ok', true,
    'total', (select count(*) from f),
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'name', name, 'country', country, 'country_code', country_code,
               'area', area, 'scale', scale, 'kind', kind,
               'cover', travel_cover_video(id, p_slug),
               'video_id', video_id, 'video_title', video_title, 'aired_at', aired_at,
               'visited', exists (select 1 from travel_visits v
                                   where v.place_id = pg.id and v.user_id = (select u from me)))
               order by aired_at desc nulls last, id)
        from pg), '[]'::jsonb));
$function$;

revoke all on function public.travel_creator_places(text, text, integer, integer) from public;
grant execute on function public.travel_creator_places(text, text, integer, integer) to anon, authenticated, service_role;
