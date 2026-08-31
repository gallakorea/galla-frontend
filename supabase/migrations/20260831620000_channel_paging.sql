-- 채널 페이지 페이징 — 영상 12,246편, 채널당 최대 700편이 쌓였다.
-- 한 번에 다 내리면 무겁고, 12편만 주면 훑는 맛이 없다. 더 보기로 늘린다.
create or replace function food_channel_videos(p_slug text, p_limit integer default 24,
                                               p_offset integer default 0)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ok', true,
    'total', (select count(*) from food_videos where channel = p_slug),
    'videos', coalesce((select jsonb_agg(jsonb_build_object(
        'video_id', v.video_id, 'title', v.title, 'at', v.published_at)
        order by v.published_at desc nulls last)
      from (select * from food_videos where channel = p_slug
             order by published_at desc nulls last
             limit least(coalesce(p_limit,24), 60) offset greatest(coalesce(p_offset,0),0)) v),
      '[]'::jsonb));
$$;
grant execute on function food_channel_videos(text,integer,integer) to anon, authenticated;

create or replace function food_channel_places(p_slug text, p_limit integer default 30,
                                               p_offset integer default 0)
returns jsonb language sql stable security definer set search_path = public as $$
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
      order by p.created_at desc
      limit least(coalesce(p_limit,30), 100) offset greatest(coalesce(p_offset,0),0)) q), '[]'::jsonb));
$$;
grant execute on function food_channel_places(text,integer,integer) to anon, authenticated;
