-- '누가 갔나'는 그 채널의 영상 썸네일이 원칙이다. 다만 영상이 연결된 곳이
-- 4,172곳 중 264곳뿐이라 나머지가 전부 🍜 로 떨어졌다.
-- → 영상이 없으면 가게 사진으로 내려간다(둘러보기와 반대 우선순위).
CREATE OR REPLACE FUNCTION public.food_browse(p_per integer DEFAULT 10, p_channels integer DEFAULT 12)
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
     where c.active
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
    select jsonb_agg(x order by ord) arr from (
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'address', p.address,
        'lat', p.lat, 'lon', p.lon, 'category', p.category,
        -- 출처 영상의 유튜브 썸네일을 카드 이미지로 쓴다(재호스팅 아님, 표준 URL 참조)
        'video_id', (select f2.video_id from food_place_sources f2
                      where f2.place_id = p.id and f2.channel = ch.slug
                        and f2.video_id is not null limit 1),
        -- 영상이 안 붙은 집(대다수)은 가게 사진으로 떨어진다. 🍜 벽보다 낫다.
        'cover', food_cover(p.id),
        'good', coalesce(st.good, 0), 'bad', coalesce(st.bad, 0),
        'visited', exists (select 1 from food_visits v
                            where v.place_id = p.id and v.user_id = (select u from me))) x,
        p.created_at ord
      from food_place_sources fs
      join food_places p on p.id = fs.place_id and p.status = 'live'
      left join food_stats st on st.place_id = p.id
      where fs.channel = ch.slug
      order by p.created_at desc
      limit least(coalesce(p_per, 10), 30)
    ) q
  ) pl on true;
$function$
;
