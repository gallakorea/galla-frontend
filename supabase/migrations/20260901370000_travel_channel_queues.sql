-- 채널 큐 분리 (2026-09-01) — 맛집에서 나머지를 굶겼던 그 함정을 여기서 미리 막는다.
--
-- 문제: 이름만 아는 채널(UC 도 핸들도 없는 것)은 last_synced_at 이 null 이라 큐 맨 앞에 선다.
--   그런데 수집기는 쿼터 절약 모드(resolve=0)에서 그런 채널을 **도장 없이** 건너뛴다
--   (다음 회차에 바로 다시 시도해야 하니 일부러 그렇게 짰다).
--   두 규칙이 만나면 큐가 영원히 안 돈다 — 앞의 10개가 매번 뽑히고 나머지 41개는 굶는다.
--   맛집에서 '실패한 채널이 큐 맨 앞에 영원히 남았다'와 같은 사고다.
--
-- → 큐를 둘로 가른다. 평상시 큐에는 **바로 훑을 수 있는 채널만** 넣고,
--   해석 대기 채널은 전용 큐에서 하루 한두 개씩만 꺼낸다(search.list 100유닛).
create or replace function public.travel_channels_next(p_n integer default 6)
returns table(slug text, name text, yt_channel_id text, yt_handle text)
language sql stable security definer set search_path = public as $$
  select c.slug, c.name, c.yt_channel_id, c.yt_handle
    from travel_channels c
   where c.active
     and (c.yt_channel_id is not null or c.yt_handle is not null)
   order by c.last_synced_at nulls first, c.sort, c.slug
   limit greatest(coalesce(p_n, 6), 1);
$$;

create or replace function public.travel_channels_unresolved(p_n integer default 1)
returns table(slug text, name text, yt_channel_id text, yt_handle text)
language sql stable security definer set search_path = public as $$
  select c.slug, c.name, c.yt_channel_id, c.yt_handle
    from travel_channels c
   where c.active and c.yt_channel_id is null and c.yt_handle is null
   order by c.sort, c.slug
   limit greatest(coalesce(p_n, 1), 1);
$$;
revoke all on function public.travel_channels_next(integer)       from anon, authenticated;
revoke all on function public.travel_channels_unresolved(integer) from anon, authenticated;
