-- 다 훑었는데도 부족분이 남는 채널을 다시 고르지 않는다
--
-- 왜: yt_video_count(유튜브가 말하는 공개 영상 수)와 우리 수는 원래 안 맞는다.
-- 업로드 재생목록에 안 나오는 것(멤버십·비공개 전환)과 우리가 일부러 거르는 쇼츠가 있다.
-- 그래서 '부족분이 큰 순서'만 보면, 끝까지 훑어도 안 차는 채널을 영원히 다시 훑는다.
-- 실측(2026-09-04): 여행하는사방(462편이 전부, 유튜브는 1,526)에 23회가 갇혀 460유닛을 태웠다.
alter table travel_channels add column if not exists full_scanned_at timestamptz;
grant select (full_scanned_at) on travel_channels to anon, authenticated;

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
     -- 끝까지 훑고도 새 게 없던 채널은 일주일 쉰다
     and (c.full_scanned_at is null or c.full_scanned_at < now() - interval '7 days')
   order by (c.yt_video_count - coalesce(v.n, 0)) desc
   limit greatest(coalesce(p_limit, 1), 1);
$$;

create or replace function public.travel_channel_full_scanned(p_slug text)
returns void language sql security definer set search_path to 'public' as $$
  update travel_channels set full_scanned_at = now() where slug = p_slug;
$$;

grant execute on function public.travel_channel_deficit(integer) to service_role;
grant execute on function public.travel_channel_full_scanned(text) to service_role;
