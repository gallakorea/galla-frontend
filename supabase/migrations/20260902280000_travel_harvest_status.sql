-- 크리에이터별 수확 현황 (2026-09-02)
--
-- 사장님: "크리에이터 리스트에 완료 됐는지 남은거 만들어."
-- 하루 종일 "어찌됨?" 을 물어보셔야 했다 — 볼 데가 없어서다. 관제센터에 붙인다.
--
-- ⚠️ '남은 편수'는 **90초 이상 영상만** 센다(travel_videos_to_harvest 와 동일).
--    쇼츠를 세면 빠니보틀처럼 '4편 남음'이 영원히 안 줄어드는 것처럼 보인다 —
--    실제로 큐가 거기 갇힐 뻔했던 자리다.
-- ⚠️ 장소 수도 spot+city 만 센다(travel_browse·travel_creator 와 동일).
--    나라·도를 세면 '르완다 1곳'이 장소로 잡힌다.
create or replace function travel_harvest_status()
returns jsonb language sql stable security definer set search_path = public as $$
  with c as (
    select ch.slug, ch.name, ch.thumb, ch.subs, ch.lang, ch.active, ch.resolved,
           (select count(*)::int from travel_videos v where v.channel = ch.slug) videos,
           (select count(*)::int from travel_videos v
             where v.channel = ch.slug and v.harvested_at is not null) done,
           (select count(*)::int from travel_videos v
             where v.channel = ch.slug and v.harvested_at is null
               and (v.duration_s is null or v.duration_s >= 90)) todo,
           (select count(distinct s.place_id)::int
              from travel_place_sources s join travel_places p on p.id = s.place_id
             where s.channel = ch.slug and p.status = 'live'
               and p.scale in ('spot','city')) places,
           (select count(distinct p.country)::int
              from travel_place_sources s join travel_places p on p.id = s.place_id
             where s.channel = ch.slug) countries
      from travel_channels ch
  ),
  cur as (select slug from travel_channel_to_harvest())
  select jsonb_build_object(
    'ok', true,
    'now', (select slug from cur),
    'rate', (select count(*)::int from travel_videos
              where harvested_at > now() - interval '1 hour'),
    'left', (select count(*)::int from travel_videos
              where harvested_at is null and (duration_s is null or duration_s >= 90)),
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', slug, 'name', name, 'thumb', thumb, 'subs', subs, 'lang', lang,
        'videos', videos, 'done', done, 'todo', todo,
        'places', places, 'countries', countries,
        'state', case
          when not resolved then 'unresolved'      -- 채널 주소를 못 찾음 = 영상 0편
          when videos = 0 then 'empty'             -- 주소는 풀렸는데 영상이 안 들어옴
          when todo = 0 then 'done'
          when slug = (select slug from cur) then 'running'
          else 'queued' end,
        'pct', case when videos > 0 then round(100.0 * done / videos) else 0 end)
        /* 화면 순서 = 수확 순서. 돌고 있는 것 → 대기 → 완료 순으로 본다. */
        order by case when slug = (select slug from cur) then 0
                      when todo > 0 and resolved then 1
                      when todo = 0 and videos > 0 then 2 else 3 end,
                 (lang is distinct from 'ko'), subs desc nulls last)
      from c), '[]'::jsonb))
$$;

revoke all on function travel_harvest_status() from public, anon;
grant execute on function travel_harvest_status() to authenticated;
