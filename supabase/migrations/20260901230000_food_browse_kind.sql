-- '누가 갔나'의 인덱스와 섹션 개수가 어긋났다.
--   실측: 유튜버 인덱스 12개 / 섹션 6개, 인증 4개 / 2개.
-- 원인 — food_browse 가 **전체 상위 20채널**을 뽑아 돌려주고, 종류 필터는 화면에서 걸었다.
--        그래서 유튜버 37개 중 전체 상위 20에 든 것만 섹션이 됐다.
-- → 종류를 서버로 넘겨 그 종류 안에서 상위를 뽑는다. 위아래가 같은 모수를 본다.
-- ⚠️ 인자를 뒤에 추가한다(p_kind 는 마지막·기본 null) — 기존 호출부가 안 깨지게.

CREATE OR REPLACE FUNCTION public.food_browse(p_per integer DEFAULT 10, p_channels integer DEFAULT 12, p_kind text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() u),
  ch as (
    select c.slug, c.name, c.kind, c.thumb,
           count(distinct p.id) total,
           count(distinct p.id) filter (
             where exists (select 1 from food_visits v
                            where v.place_id = p.id and v.user_id = (select u from me))) mine
      from food_channels c
      join food_place_sources fs on fs.channel = c.slug
      join food_places p on p.id = fs.place_id and p.status = 'live'
     where c.active and (p_kind is null or c.kind = p_kind)
     group by c.slug, c.name, c.kind, c.thumb
     having count(distinct p.id) > 0
     order by count(distinct p.id) desc
     limit least(coalesce(p_channels, 12), 30)
  )
  select jsonb_build_object('ok', true, 'sections',
    coalesce(jsonb_agg(jsonb_build_object(
      'slug', ch.slug, 'name', ch.name, 'kind', ch.kind, 'thumb', ch.thumb,
      'total', ch.total, 'visited', ch.mine,
      'pct', case when ch.total > 0 then round(ch.mine::numeric * 100 / ch.total) else 0 end,
      'places', coalesce(pl.arr, '[]'::jsonb)
    ) order by ch.total desc), '[]'::jsonb))
  from ch
  left join lateral (
    select jsonb_agg(x order by rank desc, mix) arr from (
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'address', p.address,
        'lat', p.lat, 'lon', p.lon, 'category', p.category,
        'video_id', vid, 'cover', cov,
        'good', coalesce(st.good, 0), 'bad', coalesce(st.bad, 0),
        'visited', exists (select 1 from food_visits v
                            where v.place_id = p.id and v.user_id = (select u from me))) x,
        (case when vid is not null then 2 when cov is not null then 1 else 0 end) rank,
        hashtext(p.id::text || ch.slug) mix
      from food_place_sources fs
      join food_places p on p.id = fs.place_id and p.status = 'live'
      left join food_stats st on st.place_id = p.id
      cross join lateral (
        select (select f2.video_id from food_place_sources f2
                 where f2.place_id = p.id and f2.channel = ch.slug
                   and f2.video_id is not null limit 1) vid,
               food_cover(p.id) cov
      ) img
      where fs.channel = ch.slug
      order by (case when vid is not null then 2 when cov is not null then 1 else 0 end) desc,
               hashtext(p.id::text || ch.slug)
      limit least(coalesce(p_per, 10), 30)
    ) q
  ) pl on true;
$function$
;
