-- 「누가 갔나」에 크리에이터가 14명만 보이던 것 (2026-09-12 사장님 제보: "엄청 수집했는데 왜 몇 명뿐이야")
-- 수집은 활성 97채널·장소 있는 95채널인데, 앱이 p_channels:14 로 한 번만 부르고 '더 불러오기'가 없었다.
-- 서버도 30명 상한이라 앱 숫자만 올려서는 안 된다 → p_offset 을 받아 12명씩 스크롤로 이어 붙인다.
-- 'total'(보여줄 수 있는 크리에이터 수)도 같이 준다.
-- ⚠️ 인자 목록이 바뀌면 create or replace 는 새 오버로드를 만든다(travel_route 사고: PostgREST 가 함수를
--    못 골라 null 을 삼켰다) → 옛 (integer, integer) 를 먼저 지운다. 옛 앱·웹의 (p_per, p_channels) 호출은
--    p_offset 기본값 0 으로 그대로 맞는다.
-- 페이지를 넘길 때 순서가 흔들리면 같은 사람이 두 번 나오거나 빠진다 → 마지막 기준으로 slug 를 붙였다.

drop function if exists public.travel_browse(integer, integer);

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
    select jsonb_agg(x order by created_at desc) arr from (
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'city', coalesce(p.admin1, p.city), 'country', p.country,
        'country_code', p.country_code, 'scale', p.scale, 'kind', p.kind,
        'cover', travel_cover_video(p.id, ch.slug),
        'visited', uid is not null and exists (select 1 from travel_visits v
                     where v.place_id = p.id and v.user_id = uid)) x,
        p.created_at
      /* 🔴 `select distinct p2.*` 는 travel_places 의 38개 컬럼 전부로 정렬한다(채널 하나에 9,781블록).
         exists 로 바꾸면 더 나빠진다(136,494블록) → id 만 먼저 추려 중복을 없애고 그 몇 개만 조인. */
      from (
        select p2.* from travel_places p2
         join (select distinct ts2.place_id pid
                 from travel_place_sources ts2 where ts2.channel = ch.slug) k
           on k.pid = p2.id
        where p2.status = 'live' and p2.scale = 'spot'
        order by p2.created_at desc
        limit least(coalesce(p_per, 10), 30)
      ) p
      order by p.created_at desc
    ) z) pl on true;
  return v;
end $function$;

grant execute on function public.travel_browse(integer, integer, integer) to anon, authenticated;
