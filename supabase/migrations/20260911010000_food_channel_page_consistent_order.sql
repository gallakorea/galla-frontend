-- 맛집 채널 페이지(「누가 갔나」 → 채널) 첫 페이지와 「더 보기」의 순서를 하나로 맞춘다(2026-09-11 QA 7-6-15).
-- 문제: food_channel_page 의 places 는 LIMIT 앞에 ORDER BY 가 없어 **아무 30곳**을 잘라 왔고,
--       「더 보기」(food_channel_places, offset=이미 받은 수)는 (영상 있음 > 표지 있음 > 최신 > id) 순서의 31번째부터 이어 붙였다.
--       실측(야식이 858곳): 첫 페이지 30곳 중 food_channel_places 1쪽과 겹치는 곳 2곳뿐, 2쪽과 1곳 중복(고냉지 13번째·57번째),
--       정상 1쪽의 28곳은 페이지를 넘겨도 영영 안 나온다.
-- 수정: 첫 페이지 places 를 food_channel_places(p_slug, n, 0) 결과로 채운다 — 영상 목록이 이미 food_channel_videos 로 쓰는 방식과 같다.
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
    'videos', (food_channel_videos(p_slug, least(coalesce(p_videos,12), 60), 0)) -> 'videos',
    'places', coalesce((food_channel_places(p_slug, least(coalesce(p_places, 30), 60), 0)) -> 'places', '[]'::jsonb));
$function$;

-- 2) food_channel_places 가 출처 행(영상별)을 그대로 세어 같은 가게가 여러 번 나오고 offset 도 행 단위로 밀렸다
--    (야식이 출처 896행 / 가게 858곳, 1쪽 30행 중 28곳 — 동대문엽기떡볶이 신설동점·광화문닭곰탕 ×2). 가게 단위로 뽑는다. 정렬은 그대로.
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
      from food_places p
      left join food_stats st on st.place_id = p.id
      where p.status = 'live'
        and p.id in (select fs.place_id from food_place_sources fs where fs.channel = p_slug)
      order by (case when (select f3.video_id from food_place_sources f3
                       where f3.place_id = p.id and f3.channel = p_slug
                         and f3.video_id is not null limit 1) is not null then 2
                  when food_cover(p.id) is not null then 1 else 0 end) desc,
               p.created_at desc, p.id
      limit least(coalesce(p_limit,30), 100) offset greatest(coalesce(p_offset,0),0)) q), '[]'::jsonb));
$function$;
