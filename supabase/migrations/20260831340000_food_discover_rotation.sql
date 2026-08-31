-- 디스커버리 회전 (2026-08-31)
-- ⚠️ 전 채널을 한 번에 돌리면 검색 API 에서 서로 굶는다(실측: 21개 동시 → 스니펫 0~75,
--    단독으로 돌 땐 570). 매 실행마다 몇 개씩만 돌리고 회전시킨다.
alter table public.food_channels add column if not exists last_discovered_at timestamptz;

-- 이번 세션에 이미 돈 채널은 지금 시각으로 찍어 다음 회전에서 뒤로 민다
update public.food_channels c set last_discovered_at = now()
 where c.active and exists (
   select 1 from food_place_sources fs join food_places p on p.id = fs.place_id
    where fs.channel = c.slug and p.status = 'live');

/* 이번 차례 — 가장 오래 안 돈 채널부터. 한 번도 안 돈 것(NULL)이 맨 앞이다. */
create or replace function public.food_discover_queue(p_n int default 4)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select coalesce(jsonb_agg(slug), '[]'::jsonb)
    from (select slug from food_channels
           where active
           order by last_discovered_at asc nulls first, sort
           limit greatest(coalesce(p_n, 4), 1)) t;
$fn$;
revoke all on function public.food_discover_queue(int) from public, anon, authenticated;

create or replace function public.food_discover_stamp(p_slug text)
returns void language sql security definer set search_path to 'public' as $fn$
  update food_channels set last_discovered_at = now() where slug = p_slug;
$fn$;
revoke all on function public.food_discover_stamp(text) from public, anon, authenticated;

select food_discover_queue(4) as 다음차례;
