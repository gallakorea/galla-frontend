-- 채널 페이지도 섹션과 같은 순서 문제였다 — created_at desc 라 사진 없는 최신 집이 앞을 다 먹었다.
-- 그림(영상>사진) 있는 집을 먼저 세운다. 최신순은 2차, p.id 는 offset 페이징이 흔들리지 않게 3차.
-- ⚠️ 정의는 손으로 옮겨 적지 않고 pg_get_functiondef 원문에서 ORDER BY 만 바꿔 넣었다.

CREATE OR REPLACE FUNCTION public.food_channel_page(p_slug text, p_places integer DEFAULT 30, p_videos integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() u)
  select jsonb_build_object(
    'ok', true,
    'channel', (select jsonb_build_object(
        'slug', c.slug, 'name', c.name, 'kind', c.kind, 'thumb', c.thumb,
        'total', (select count(distinct fs.place_id) from food_place_sources fs
                   join food_places p2 on p2.id = fs.place_id and p2.status='live'
                  where fs.channel = c.slug),
        'visited', (select count(distinct fs.place_id) from food_place_sources fs
                     join food_visits v on v.place_id = fs.place_id and v.user_id = (select u from me)
                    where fs.channel = c.slug))
      from food_channels c where c.slug = p_slug),
    'videos', coalesce((select jsonb_agg(jsonb_build_object(
        'video_id', v.video_id, 'title', v.title, 'at', v.published_at)
        order by v.published_at desc nulls last)
      from (select * from food_videos where channel = p_slug
             order by published_at desc nulls last
             limit least(coalesce(p_videos, 12), 40)) v), '[]'::jsonb),
    'places', coalesce((select jsonb_agg(x order by ord desc) from (
        select jsonb_build_object(
          'id', p.id, 'name', p.name, 'address', p.address, 'category', p.category,
          'cover', food_cover(p.id),
          'video_id', (select f2.video_id from food_place_sources f2
                        where f2.place_id = p.id and f2.channel = p_slug
                          and f2.video_id is not null limit 1),
          'good', coalesce(st.good,0), 'bad', coalesce(st.bad,0),
          'visited', exists (select 1 from food_visits v
                              where v.place_id = p.id and v.user_id = (select u from me))) x,
          p.created_at ord
        from food_place_sources fs
        join food_places p on p.id = fs.place_id and p.status = 'live'
        left join food_stats st on st.place_id = p.id
        where fs.channel = p_slug
        order by (case when (select f3.video_id from food_place_sources f3
                       where f3.place_id = p.id and f3.channel = p_slug
                         and f3.video_id is not null limit 1) is not null then 2
                  when food_cover(p.id) is not null then 1 else 0 end) desc,
               p.created_at desc, p.id
        limit least(coalesce(p_places, 30), 100)) q), '[]'::jsonb));
$function$
;

CREATE OR REPLACE FUNCTION public.food_channel_places(p_slug text, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() u)
  select jsonb_build_object(
    'ok', true,
    'places', coalesce((select jsonb_agg(x order by ord desc) from (
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'address', p.address, 'category', p.category,
        'cover', food_cover(p.id),
        'video_id', (select f2.video_id from food_place_sources f2
                      where f2.place_id = p.id and f2.channel = p_slug
                        and f2.video_id is not null limit 1),
        'good', coalesce(st.good,0), 'bad', coalesce(st.bad,0),
        'visited', exists (select 1 from food_visits v
                            where v.place_id = p.id and v.user_id = (select u from me))) x,
        p.created_at ord
      from food_place_sources fs
      join food_places p on p.id = fs.place_id and p.status = 'live'
      left join food_stats st on st.place_id = p.id
      where fs.channel = p_slug
      order by (case when (select f3.video_id from food_place_sources f3
                       where f3.place_id = p.id and f3.channel = p_slug
                         and f3.video_id is not null limit 1) is not null then 2
                  when food_cover(p.id) is not null then 1 else 0 end) desc,
               p.created_at desc, p.id
      limit least(coalesce(p_limit,30), 100) offset greatest(coalesce(p_offset,0),0)) q), '[]'::jsonb));
$function$
;
