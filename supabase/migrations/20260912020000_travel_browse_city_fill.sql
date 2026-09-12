-- 「누가 갔나」에서 김한량 줄이 비어 있던 것 (2026-09-12 사장님 제보: "썸네일이 안 나온다")
-- 김한량은 연결된 19곳이 전부 나라·지역·도시라 구체 장소(spot)가 0곳이다(중앙아시아 여정 — 설명란에 상호가 없다).
-- 줄은 spot 만 보여줘서 헤더만 있고 비었다. 그런데 옆의 「4곳」(place_n)과 크리에이터 상세 화면
-- (travel_creator_places)은 spot+city 를 센다 → 줄만 기준이 달랐다.
-- → spot 을 먼저 채우고, 칸이 남으면 city 로 채운다. spot 이 p_per 이상인 크리에이터는 결과가 그대로다.
--   썸네일은 그대로 그 채널 본인의 영상(travel_cover_video) — 도시에도 붙는 것 확인.
-- 시그니처가 같아 오버로드는 생기지 않는다.

create or replace function public.travel_browse(p_per integer default 10, p_channels integer default 12, p_offset integer default 0)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v jsonb; uid uuid := auth.uid(); v_total int;
begin
  select count(*) into v_total from travel_channels c where c.active and c.place_n > 0;
  with ch as (
    select c.slug, c.name, c.thumb, c.lang, c.subs, c.place_n total
      from travel_channels c
     where c.active and c.place_n > 0
     order by (c.lang is distinct from 'ko'), c.subs desc nulls last, c.place_n desc, c.slug
     offset greatest(coalesce(p_offset, 0), 0)
     limit least(coalesce(p_channels, 12), 30)
  )
  select jsonb_build_object('ok', true, 'total', v_total, 'offset', greatest(coalesce(p_offset, 0), 0), 'sections',
    coalesce(jsonb_agg(jsonb_build_object(
      'slug', ch.slug, 'name', ch.name, 'thumb', ch.thumb, 'lang', ch.lang,
      'subs', ch.subs, 'total', ch.total, 'visited', coalesce(mv.n, 0),
      'pct', case when ch.total > 0 then round(coalesce(mv.n,0)::numeric * 100 / ch.total) else 0 end,
      'places', coalesce(pl.arr, '[]'::jsonb)
    ) order by (ch.lang is distinct from 'ko'), ch.subs desc nulls last, ch.total desc, ch.slug), '[]'::jsonb))
    into v
  from ch
  /* '내가 가본 수'는 사람마다 다르니 미리 못 센다 — 이 페이지 몫만 남은 뒤에 센다 */
  left join lateral (
    select count(distinct v2.place_id) n from travel_visits v2
     join travel_place_sources ts3 on ts3.place_id = v2.place_id and ts3.channel = ch.slug
     where uid is not null and v2.user_id = uid) mv on true
  left join lateral (
    select jsonb_agg(x order by spot_first, created_at desc) arr from (
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'city', coalesce(p.admin1, p.city), 'country', p.country,
        'country_code', p.country_code, 'scale', p.scale, 'kind', p.kind,
        'cover', travel_cover_video(p.id, ch.slug),
        'visited', uid is not null and exists (select 1 from travel_visits v
                     where v.place_id = p.id and v.user_id = uid)) x,
        (p.scale <> 'spot') spot_first, p.created_at
      /* 🔴 `select distinct p2.*` 는 travel_places 의 38개 컬럼 전부로 정렬한다(채널 하나에 9,781블록).
         exists 로 바꾸면 더 나빠진다(136,494블록) → id 만 먼저 추려 중복을 없애고 그 몇 개만 조인. */
      from (
        select p2.* from travel_places p2
         join (select distinct ts2.place_id pid
                 from travel_place_sources ts2 where ts2.channel = ch.slug) k
           on k.pid = p2.id
        where p2.status = 'live' and p2.scale in ('spot', 'city')
        order by (p2.scale <> 'spot'), p2.created_at desc          -- spot 먼저, 모자라면 city 로 채움
        limit least(coalesce(p_per, 10), 30)
      ) p
    ) z) pl on true;
  return v;
end $function$;

grant execute on function public.travel_browse(integer, integer, integer) to anon, authenticated;
