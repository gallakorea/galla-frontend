-- 🔴 food_browse 가 155,933블록 · 316ms 다. 오늘 잰 것 중 가장 무겁다.
--    브라우저 실측으로도 480~560ms 로 앱에서 제일 느린 화면이다.
--
-- 원인은 travel_browse 와 같다: ch CTE 가 **모든 활성 채널 × 그 채널의 모든 장소**를 조인해
--   count(distinct) 를 돌린 뒤 상위 20개만 쓴다. 채널 60개 · 장소 37,905곳을 매 호출마다 센다.
--   게다가 '내가 가본 곳'까지 곳마다 exists 로 센다.
alter table food_channels add column if not exists place_n integer not null default 0;

update food_channels c set place_n = (
  select count(distinct fs.place_id) from food_place_sources fs
   join food_places p on p.id = fs.place_id and p.status='live'
  where fs.channel = c.slug);

create index if not exists food_channels_browse
  on food_channels (kind, place_n desc) where active;

create or replace function public.food_channel_counts_refresh()
returns integer language sql security definer set search_path to 'public' as $$
  with u as (
    update food_channels c set place_n = (
      select count(distinct fs.place_id) from food_place_sources fs
       join food_places p on p.id = fs.place_id and p.status='live'
      where fs.channel = c.slug)
     where c.active
    returning 1)
  select count(*)::int from u;
$$;
revoke all on function public.food_channel_counts_refresh() from public, anon, authenticated;

/* SQL → plpgsql. SQL 함수는 파라미터가 상수로 안 접혀 전량 스캔 계획이 나온다
   (food_map 실측: 같은 본문이 함수로는 32,819블록, 직접 돌리면 351블록). */
create or replace function public.food_browse(
  p_per integer default 10, p_channels integer default 12, p_kind text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare v jsonb; uid uuid := auth.uid();
begin
  with ch as (
    select c.slug, c.name, c.kind, c.thumb, c.place_n total
      from food_channels c
     where c.active and c.place_n > 0 and (p_kind is null or c.kind = p_kind)
     order by c.place_n desc
     limit least(coalesce(p_channels, 12), 30)
  )
  select jsonb_build_object('ok', true, 'sections',
    coalesce(jsonb_agg(jsonb_build_object(
      'slug', ch.slug, 'name', ch.name, 'kind', ch.kind, 'thumb', ch.thumb,
      'total', ch.total, 'visited', coalesce(mv.n, 0),
      'pct', case when ch.total > 0 then round(coalesce(mv.n,0)::numeric * 100 / ch.total) else 0 end,
      'places', coalesce(pl.arr, '[]'::jsonb)
    ) order by ch.total desc), '[]'::jsonb))
    into v
  from ch
  /* '내가 가본 수'는 사람마다 다르니 미리 못 센다 — 상위 20개만 남은 뒤에 센다 */
  left join lateral (
    select count(distinct v2.place_id) n from food_visits v2
     join food_place_sources f3 on f3.place_id = v2.place_id and f3.channel = ch.slug
     where uid is not null and v2.user_id = uid) mv on true
  left join lateral (
    select jsonb_agg(x order by rank desc, mix) arr from (
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'address', p.address,
        'lat', p.lat, 'lon', p.lon, 'category', p.category,
        'video_id', img.vid, 'cover', img.cov,
        'good', coalesce(st.good, 0), 'bad', coalesce(st.bad, 0),
        'visited', uid is not null and exists (select 1 from food_visits v
                     where v.place_id = p.id and v.user_id = uid)) x,
        (case when img.vid is not null then 2 when img.cov is not null then 1 else 0 end) rank,
        hashtext(p.id::text || ch.slug) mix
      from food_place_sources fs
      join food_places p on p.id = fs.place_id and p.status = 'live'
      left join food_stats st on st.place_id = p.id
      cross join lateral (
        select (select f2.video_id from food_place_sources f2
                 where f2.place_id = p.id and f2.channel = ch.slug
                   and f2.video_id is not null limit 1) vid,
               /* 미리 담아둔 커버를 쓴다 — food_cover() 는 곳마다 서브쿼리다 */
               p.cover_url cov
      ) img
      where fs.channel = ch.slug
      order by (case when img.vid is not null then 2 when img.cov is not null then 1 else 0 end) desc,
               hashtext(p.id::text || ch.slug)
      limit least(coalesce(p_per, 10), 30)
    ) q) pl on true;
  return v;
end $fn$;
grant execute on function public.food_browse(integer,integer,text) to anon, authenticated;
