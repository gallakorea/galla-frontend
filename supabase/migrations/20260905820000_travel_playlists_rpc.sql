-- 여행도 같은 구조를 쓴다. 고독한 미식가처럼 **해외 식당**을 도는 프로는 맛집이 아니라 여행이다
-- (우리 맛집 검증은 네이버 지역검색이라 국내 가게만 붙는다).
create or replace function public.travel_playlists_due(p_limit integer default 3)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'playlist_id', playlist_id, 'channel', channel, 'title', title)
         order by synced_at nulls first), '[]'::jsonb)
    from (select * from travel_playlists where active
           order by synced_at nulls first limit greatest(coalesce(p_limit,3),1)) q;
$$;
create or replace function public.travel_playlist_done(p_id text, p_n integer)
returns void language sql security definer set search_path to 'public' as $$
  update travel_playlists set synced_at = now(), n_items = p_n where playlist_id = p_id;
$$;
revoke all on function public.travel_playlists_due(integer) from public, anon, authenticated;
revoke all on function public.travel_playlist_done(text, integer) from public, anon, authenticated;

insert into travel_channels(slug, name, kind, active)
values ('kodoku', '고독한 미식가', 'tv', true)
on conflict (slug) do update set active = true;
insert into travel_playlists(playlist_id, channel, title)
values ('PL5hwTY4-EfWJK6X5dPCDhTORxGAwlZ4cv', 'kodoku', '고독한 미식가 BEST (도라마코리아)')
on conflict (playlist_id) do nothing;
