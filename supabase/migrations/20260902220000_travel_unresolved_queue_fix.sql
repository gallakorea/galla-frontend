-- 핸들이 있는데 실패한 채널이 영영 재시도되지 않았다 (2026-09-02)
--
-- 사장님: "영상이 수집되어야지 뭐 하는 거야."
-- 실제로 113개 채널 중 26개가 **영상 0편**이었다. 원인은 큐 조건이다:
--   where c.active and c.yt_channel_id is null and c.yt_handle is null
--                                                  ^^^^^^^^^^^^^^^^^^^
-- '핸들을 모르는 채널'만 재시도 대상이었다. 핸들은 등록돼 있는데 해석에 실패한
-- 17개(@daenggu·@yoobeer·@frog_out 등)는 큐에 아예 안 들어와서, 고쳐도 다시
-- 시도조차 안 됐다. 조건을 '채널 ID 가 없으면 재시도'로 바로잡는다.
--
-- ⚠️ 매 회차 같은 채널을 무한히 두드리지 않게 last_synced_at 으로 뒤로 민다.
--    해석에 성공하면 yt_channel_id 가 채워져 큐에서 자연히 빠진다.
create or replace function public.travel_channels_unresolved(p_n integer default 1)
returns table(slug text, name text, yt_channel_id text, yt_handle text)
language sql stable security definer set search_path = public as $$
  select c.slug, c.name, c.yt_channel_id, c.yt_handle
    from travel_channels c
   where c.active and c.yt_channel_id is null
   order by c.last_synced_at nulls first, c.sort, c.slug
   limit greatest(coalesce(p_n, 1), 1);
$$;
