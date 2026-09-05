-- travel_browse 가 34,311블록을 읽는다. food_map 과 같은 병이다.
--
-- 원인: ch CTE 가 **모든 활성 채널 × 그 채널의 모든 장소**를 조인해 count(distinct) 를 돌린 뒤
--   상위 14개만 쓴다. 채널이 60개, 장소가 16,528곳이라 매 호출마다 전부를 센다.
--   게다가 '내가 가본 곳'(mine)까지 곳마다 exists 로 센다.
--
-- 고치는 법: 채널별 장소 수는 자주 안 바뀐다. **미리 세어 둔다.**
--   '내가 가본 수'는 사람마다 다르니 남겨두되, 상위 채널만 남은 뒤에 센다.
alter table travel_channels add column if not exists place_n integer not null default 0;

update travel_channels c set place_n = (
  select count(distinct ts.place_id) from travel_place_sources ts
   join travel_places p on p.id = ts.place_id and p.status='live' and p.scale in ('spot','city')
  where ts.channel = c.slug);

create index if not exists travel_channels_browse
  on travel_channels ((lang is distinct from 'ko'), subs desc nulls last, place_n desc)
  where active;

/* 장소가 붙고 떨어질 때 갱신 — 30분 크론으로 충분하다(목록 카드는 정확한 실시간이 아니어도 된다) */
create or replace function public.travel_channel_counts_refresh()
returns integer language sql security definer set search_path to 'public' as $$
  with u as (
    update travel_channels c set place_n = (
      select count(distinct ts.place_id) from travel_place_sources ts
       join travel_places p on p.id = ts.place_id and p.status='live' and p.scale in ('spot','city')
      where ts.channel = c.slug)
     where c.active
    returning 1)
  select count(*)::int from u;
$$;
revoke all on function public.travel_channel_counts_refresh() from public, anon, authenticated;

/* 🔴 SQL → plpgsql. SQL 함수는 파라미터가 상수로 안 접혀 전량 스캔 계획이 나온다
   (food_map 에서 실측: 같은 본문이 함수로는 32,819블록, 직접 돌리면 351블록). */
create or replace function public.travel_browse(p_per integer default 10, p_channels integer default 12)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare v jsonb; uid uuid := auth.uid();
begin
  with ch as (
    select c.slug, c.name, c.thumb, c.lang, c.subs, c.place_n total
      from travel_channels c
     where c.active and c.place_n > 0
     order by (c.lang is distinct from 'ko'), c.subs desc nulls last, c.place_n desc
     limit least(coalesce(p_channels, 12), 30)
  )
  select jsonb_build_object('ok', true, 'sections',
    coalesce(jsonb_agg(jsonb_build_object(
      'slug', ch.slug, 'name', ch.name, 'thumb', ch.thumb, 'lang', ch.lang,
      'subs', ch.subs, 'total', ch.total, 'visited', coalesce(mv.n, 0),
      'pct', case when ch.total > 0 then round(coalesce(mv.n,0)::numeric * 100 / ch.total) else 0 end,
      'places', coalesce(pl.arr, '[]'::jsonb)
    ) order by (ch.lang is distinct from 'ko'), ch.subs desc nulls last, ch.total desc), '[]'::jsonb))
    into v
  from ch
  /* '내가 가본 수'는 사람마다 다르니 미리 못 센다 — 상위 14개만 남은 뒤에 센다 */
  left join lateral (
    select count(distinct v2.place_id) n from travel_visits v2
     join travel_place_sources ts3 on ts3.place_id = v2.place_id and ts3.channel = ch.slug
     where uid is not null and v2.user_id = uid) mv on true
  left join lateral (
    select jsonb_agg(x order by created_at desc) arr from (
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'city', coalesce(p.admin1, p.city), 'country', p.country,
        'country_code', p.country_code, 'scale', p.scale, 'kind', p.kind,
        'cover', travel_cover_video(p.id, ch.slug),
        'visited', uid is not null and exists (select 1 from travel_visits v
                     where v.place_id = p.id and v.user_id = uid)) x,
        p.created_at
      from (
        select distinct p2.* from travel_place_sources ts2
          join travel_places p2 on p2.id = ts2.place_id
                               and p2.status = 'live' and p2.scale = 'spot'
         where ts2.channel = ch.slug
      ) p
      order by p.created_at desc
      limit least(coalesce(p_per, 10), 30)
    ) z) pl on true;
  return v;
end $fn$;
grant execute on function public.travel_browse(integer, integer) to anon, authenticated;
