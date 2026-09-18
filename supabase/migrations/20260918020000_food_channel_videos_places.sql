-- 채널 페이지 영상을 누르면 그 영상에 나온 가게 상세를 띄운다(26.9.18 사장님).
-- food_place_sources 는 RLS 로 클라이언트가 못 읽는다 → 영상마다 연결된 가게(id·이름·주소, 최대 6곳 — 같은 이름의 지점을 주소로 가른다)를 함께 준다.
-- 기존 필드(video_id·title·at·shops·askable)는 그대로.
create or replace function public.food_channel_videos(p_slug text, p_limit integer default 24, p_offset integer default 0)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'ok', true,
    'total', (select count(*) from food_videos where channel = p_slug),
    'videos', coalesce((select jsonb_agg(jsonb_build_object(
        'video_id', v.video_id, 'title', v.title, 'at', v.published_at,
        'shops', (select count(*) from food_place_sources s where s.video_id = v.video_id),
        'places', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'addr', p.address) order by p.name)
                              from (select distinct s.place_id from food_place_sources s where s.video_id = v.video_id) x
                              join food_places p on p.id = x.place_id and p.status = 'live'
                             limit 6), '[]'::jsonb),
        'askable', coalesce(v.region,'') <> '' and length(coalesce(v.title,'')) >= 14)
        order by v.published_at desc nulls last)
      from (select * from food_videos where channel = p_slug
             order by published_at desc nulls last
             limit least(coalesce(p_limit,24), 60) offset greatest(coalesce(p_offset,0),0)) v),
      '[]'::jsonb));
$function$;
