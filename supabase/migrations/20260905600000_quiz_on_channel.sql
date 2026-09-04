-- 퀴즈는 **크리에이터 페이지에만** 둔다. 지도·둘러보기는 가게를 보는 자리지 영상을 푸는 자리가 아니다.
-- 상세는 유도만 한다("어느 회차인지 못 찾았습니다 → 내가 안다").
--
-- 그래서 채널 페이지의 영상마다 '이 회차의 집을 아는가'를 같이 내려준다.

create or replace function food_channel_videos(p_slug text, p_limit integer default 24,
                                               p_offset integer default 0)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ok', true,
    'total', (select count(*) from food_videos where channel = p_slug),
    'videos', coalesce((select jsonb_agg(jsonb_build_object(
        'video_id', v.video_id, 'title', v.title, 'at', v.published_at,
        'shops', (select count(*) from food_place_sources s where s.video_id = v.video_id),
        /* 물어볼 만한 회차인가 — 쇼츠 클립은 봐도 가게가 안 나온다 */
        'askable', (case when v.title ~ 'EP\.?[0-9]|[0-9]+화|특집' then 3 else 0 end
                  + case when v.title ~ '맛집|식당|먹방|투어|털었|가야|추천|골목|노포' then 2 else 0 end
                  + case when coalesce(v.region,'') <> '' then 2 else 0 end
                  + least(length(coalesce(v.title,'')) / 15, 2)) >= 5)
        order by v.published_at desc nulls last)
      from (select * from food_videos where channel = p_slug
             order by published_at desc nulls last
             limit least(coalesce(p_limit,24), 60) offset greatest(coalesce(p_offset,0),0)) v),
      '[]'::jsonb));
$$;
grant execute on function food_channel_videos(text,integer,integer) to anon, authenticated;

-- 채널 첫 화면도 같은 계약으로
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
    'videos', (food_channel_videos(p_slug, least(coalesce(p_videos,12), 60), 0)) -> 'videos',
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
       group by p.id, p.name, p.address, p.category, st.good, st.bad, p.created_at
       limit least(coalesce(p_places, 30), 60)) q), '[]'::jsonb));
$$;
grant execute on function food_channel_page(text,integer,integer) to anon, authenticated;

-- 특정 영상 하나로 퀴즈를 열 수 있어야 한다(채널 페이지에서 그 회차를 눌러 들어온다).
-- ⚠️ 오버로드를 만들지 않는다 — 인자 이름이 겹치면 PostgREST 가 못 고르고 앱이 죽는다.
drop function if exists public.food_quiz_next(integer);
create function public.food_quiz_next(
  p_limit integer default 1, p_channel text default null, p_video text default null)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'video_id', video_id, 'title', title, 'channel', channel,
           'channel_name', cname, 'region', region) order by score desc, published_at desc), '[]'::jsonb)
    from (
      select v.video_id, v.title, v.channel, c.name cname, v.region, v.published_at,
             (case when v.title ~ 'EP\.?[0-9]|[0-9]+화|특집' then 3 else 0 end
            + case when v.title ~ '맛집|식당|먹방|투어|털었|가야|추천|골목|노포' then 2 else 0 end
            + case when coalesce(v.region,'') <> '' then 2 else 0 end
            + least(length(coalesce(v.title,'')) / 15, 2)) score
        from food_videos v
        join food_channels c on c.slug = v.channel and c.active
       where (p_video is not null or v.harvested_at is null)
         and (p_video is null or v.video_id = p_video)
         and (p_channel is null or v.channel = p_channel)
         and (p_video is not null
              or not exists (select 1 from food_place_sources s where s.video_id = v.video_id))
         and (p_video is not null
              or not exists (select 1 from food_quiz_answers a
                              where a.video_id = v.video_id and a.user_id = auth.uid()))
       order by score desc, random()
       limit greatest(coalesce(p_limit, 1), 1)
    ) q
   where p_video is not null or score >= 5;
$$;
revoke all on function public.food_quiz_next(integer, text, text) from public, anon;
grant execute on function public.food_quiz_next(integer, text, text) to authenticated;
