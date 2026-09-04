-- 가장 덜 긁힌 채널을 준다
--
-- 왜: 수집 크론이 채널을 순서대로 6개씩 돌며 앞 50편만 봤다. 그러면 이미 다 가진 채널을
-- 계속 다시 물어보고, 3,454편짜리 채널은 영영 안 찬다. 부족분이 큰 순서로 하나씩 끝까지 훑는다.
create or replace function public.travel_channel_deficit(p_limit integer default 1)
returns table(slug text, name text, yt integer, got integer, missing integer)
language sql stable security definer set search_path to 'public' as $$
  select c.slug, c.name, c.yt_video_count,
         coalesce(v.n, 0)::int,
         (c.yt_video_count - coalesce(v.n, 0))::int
    from travel_channels c
    left join (select channel, count(*) n from travel_videos group by channel) v
           on v.channel = c.slug
   where c.resolved
     and c.active
     and c.yt_video_count is not null
     and c.yt_video_count - coalesce(v.n, 0) > 0
   order by (c.yt_video_count - coalesce(v.n, 0)) desc
   limit greatest(coalesce(p_limit, 1), 1);
$$;

grant execute on function public.travel_channel_deficit(integer) to service_role;
