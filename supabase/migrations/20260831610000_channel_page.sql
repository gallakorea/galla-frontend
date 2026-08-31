-- 채널 페이지 — "그 사람을 누르면 식당 리스트와 영상이 떠야 한다"(사장님).
--
-- ⚠️ 장소에 연결된 영상은 3%뿐이다. 제목·설명 어디에도 상호를 안 쓰는 채널이 많아서다
--    (또간집 700편 → 매칭 9건). 그러니 채널 페이지에서는 **그 채널의 영상 자체**를 보여준다.
--    "이 집이 나온 영상"이 아니라 "이 채널의 최근 영상"이다 — 거짓말하지 않는 선.
create or replace function food_channel_page(p_slug text, p_places integer default 30,
                                             p_videos integer default 12)
returns jsonb language sql stable security definer set search_path = public as $$
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
        order by p.created_at desc
        limit least(coalesce(p_places, 30), 100)) q), '[]'::jsonb));
$$;
grant execute on function food_channel_page(text,integer,integer) to anon, authenticated;
