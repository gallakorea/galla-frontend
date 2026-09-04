-- 지역을 미리 박는다. 부를 때마다 지명 209개를 대조하면(lateral + LIKE) statement timeout 이다.
-- 카탈로그가 21,000편을 넘으면서 한계를 넘었다.
alter table food_videos add column if not exists region text;
create index if not exists food_videos_region_idx on food_videos(channel, region) where region is not null;

create or replace function public.food_videos_fill_region(p_limit integer default 5000)
returns integer language sql security definer set search_path to 'public' as $$
  with t as (
    select video_id, channel from food_videos
     where region is null and harvested_at is null
     limit greatest(coalesce(p_limit, 5000), 1)),
  m as (
    select t.video_id, t.channel,
           (select r.name from kr_region_names r
             where (coalesce(v.title,'') || ' ' || coalesce(v.description,'') || ' ' || coalesce(v.tags,''))
                   like '%' || r.name || '%'
             order by length(r.name) desc limit 1) nm   -- 긴 지명 우선('남구'보다 '통영')
      from t join food_videos v on v.video_id = t.video_id and v.channel = t.channel),
  u as (
    update food_videos v set region = coalesce(m.nm, '')   -- 없으면 빈칸: 다시 안 본다
      from m where v.video_id = m.video_id and v.channel = m.channel
    returning 1)
  select count(*)::int from u;
$$;
revoke all on function public.food_videos_fill_region(integer) from public, anon;

create or replace function public.food_videos_blog_targets(p_channel text, p_limit integer default 20)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(x order by score desc, published_at desc nulls last), '[]'::jsonb) from (
    select v.published_at,
           /* 회차형을 앞으로 — 쇼츠 클립은 블로그 질의가 성립하지 않는다 */
           (case when v.title ~ 'EP\.?[0-9]|[0-9]+화|특집' then 3 else 0 end
          + case when v.title ~ '맛집|식당|먹방|투어|털었|가야|추천' then 2 else 0 end
          + least(length(coalesce(v.title,'')) / 15, 2)) score,
           jsonb_build_object('video_id', v.video_id, 'title', v.title,
                              'channel', v.channel, 'published_at', v.published_at,
                              'region', v.region) x
      from food_videos v
     where v.harvested_at is null
       and coalesce(v.region, '') <> ''
       and (p_channel is null or v.channel = p_channel)
       and length(coalesce(v.title,'')) >= 6
     order by score desc, v.published_at desc nulls last
     limit greatest(coalesce(p_limit, 20), 1)
  ) q;
$$;
revoke all on function public.food_videos_blog_targets(text, integer) from public, anon;
