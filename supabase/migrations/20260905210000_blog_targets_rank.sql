-- 회차형 영상을 앞으로. 같은 채널이라도 쇼츠 클립과 본편은 값이 다르다.
-- 실측: '또간집 EP.97 분당 정자 야탑…' 은 블로그가 받쳐주지만
--       '군필자 공감'(철원 태그만 달린 클립)은 질의가 노이즈만 부른다.
create or replace function public.food_videos_blog_targets(p_channel text, p_limit integer default 20)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(x order by score desc, published_at desc nulls last), '[]'::jsonb) from (
    select v.published_at,
           (case when v.title ~ 'EP\.?[0-9]|[0-9]+화|특집' then 3 else 0 end
          + case when v.title ~ '맛집|식당|먹방|투어|털었|가야|추천' then 2 else 0 end
          + least(length(coalesce(v.title,'')) / 15, 2)) score,
           jsonb_build_object('video_id', v.video_id, 'title', v.title,
                              'channel', v.channel, 'published_at', v.published_at,
                              'region', g.name) x
      from food_videos v
      join lateral (
        select r.name from kr_region_names r
         where (coalesce(v.title,'') || ' ' || coalesce(v.description,'') || ' ' || coalesce(v.tags,''))
               like '%' || r.name || '%'
         order by length(r.name) desc limit 1
      ) g on true
     where v.harvested_at is null
       and (p_channel is null or v.channel = p_channel)
       and length(coalesce(v.title,'')) >= 6
     order by (case when v.title ~ 'EP\.?[0-9]|[0-9]+화|특집' then 3 else 0 end
             + case when v.title ~ '맛집|식당|먹방|투어|털었|가야|추천' then 2 else 0 end
             + least(length(coalesce(v.title,'')) / 15, 2)) desc,
              v.published_at desc nulls last
     limit greatest(coalesce(p_limit, 20), 1)
  ) q;
$$;
revoke all on function public.food_videos_blog_targets(text, integer) from public, anon;
