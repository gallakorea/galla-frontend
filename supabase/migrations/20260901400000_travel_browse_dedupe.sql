-- travel_browse 중복 카드 수정 (2026-09-01)
-- 한 곳이 같은 크리에이터의 영상 **두 편**에 나오면 travel_place_sources 조인이 행을 두 번 만든다.
-- 실측: Mark Wiens 섹션에 '카불'이 두 번 떴다(DB 에는 한 행뿐이었다 — 조인이 범인).
-- → 장소 단위로 먼저 접고(distinct on) 그 다음에 정렬한다.
create or replace function public.travel_browse(p_per int default 10, p_channels int default 12)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with me as (select auth.uid() u),
  ch as (
    select c.slug, c.name, c.thumb, c.lang,
           count(distinct p.id) total,
           count(distinct p.id) filter (
             where exists (select 1 from travel_visits v
                            where v.place_id = p.id and v.user_id = (select u from me))) mine
      from travel_channels c
      join travel_place_sources ts on ts.channel = c.slug
      join travel_places p on p.id = ts.place_id and p.status = 'live'
     where c.active
     group by c.slug, c.name, c.thumb, c.lang
    having count(distinct p.id) > 0
     order by count(distinct p.id) desc
     limit least(coalesce(p_channels, 12), 30)
  )
  select jsonb_build_object('ok', true, 'sections',
    coalesce(jsonb_agg(jsonb_build_object(
      'slug', ch.slug, 'name', ch.name, 'thumb', ch.thumb, 'lang', ch.lang,
      'total', ch.total, 'visited', ch.mine,
      'pct', case when ch.total > 0 then round(ch.mine::numeric * 100 / ch.total) else 0 end,
      'places', coalesce(pl.arr, '[]'::jsonb)
    ) order by ch.total desc), '[]'::jsonb))
  from ch
  left join lateral (
    select jsonb_agg(x order by ord, created_at desc) arr from (
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'city', p.city, 'country', p.country,
        'scale', p.scale, 'kind', p.kind, 'lat', p.lat, 'lon', p.lon,
        'cover', travel_cover(p.id),
        'visited', exists (select 1 from travel_visits v
                            where v.place_id = p.id and v.user_id = (select u from me))) x,
        (case when p.photo is not null then 0 else 1 end) ord,
        p.created_at
      from (
        select distinct p2.*                       -- ⚠️ 여기서 접지 않으면 영상 편수만큼 카드가 늘어난다
          from travel_place_sources ts2
          join travel_places p2 on p2.id = ts2.place_id and p2.status = 'live'
         where ts2.channel = ch.slug
      ) p
      order by (case when p.photo is not null then 0 else 1 end), p.created_at desc
      limit least(coalesce(p_per, 10), 30)
    ) q
  ) pl on true;
$fn$;
grant execute on function public.travel_browse(int,int) to anon, authenticated;
