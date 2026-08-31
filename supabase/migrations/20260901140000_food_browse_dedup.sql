-- 그림 있는 집을 먼저 세우게 고쳤더니(0901110000) **같은 집이 모든 섹션 1번에** 떴다.
-- '사진 있음'은 채널과 무관한 전역 속성이라, 여러 채널에 걸친 집이 전부 위로 뜬 것이다.
--   실측(사장님 캡처): '모꼬지에'가 백년가게·또간집·수요미식회 세 섹션 모두 첫 칸.
--
-- → 2차 정렬을 채널마다 다르게 흔든다(hashtext(place||channel)). 그림 우선은 그대로 두고,
--   같은 등급 안에서 섹션마다 다른 집이 뽑히게 한다. 무작위가 아니라 해시라 매번 같다.
-- ⚠️ 채널 페이지는 이 변경에서 제외한다 — 거기는 offset 페이징이라 p.id 정렬이어야 안 흔들린다.
create or replace function food_browse(p_per integer default 10, p_channels integer default 12)
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() u),
  ch as (
    select c.slug, c.name, c.kind, c.thumb,
           count(distinct p.id) total,
           count(distinct p.id) filter (
             where exists (select 1 from food_visits v
                            where v.place_id = p.id and v.user_id = (select u from me))) mine
      from food_channels c
      join food_place_sources fs on fs.channel = c.slug
      join food_places p on p.id = fs.place_id and p.status = 'live'
     where c.active
     group by c.slug, c.name, c.kind, c.thumb
     having count(distinct p.id) > 0
     order by count(distinct p.id) desc
     limit least(coalesce(p_channels, 12), 30)
  )
  select jsonb_build_object('ok', true, 'sections',
    coalesce(jsonb_agg(jsonb_build_object(
      'slug', ch.slug, 'name', ch.name, 'kind', ch.kind, 'thumb', ch.thumb,
      'total', ch.total, 'visited', ch.mine,
      'pct', case when ch.total > 0 then round(ch.mine::numeric * 100 / ch.total) else 0 end,
      'places', coalesce(pl.arr, '[]'::jsonb)
    ) order by ch.total desc), '[]'::jsonb))
  from ch
  left join lateral (
    select jsonb_agg(x order by rank desc, mix) arr from (
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'address', p.address,
        'lat', p.lat, 'lon', p.lon, 'category', p.category,
        'video_id', vid, 'cover', cov,
        'good', coalesce(st.good, 0), 'bad', coalesce(st.bad, 0),
        'visited', exists (select 1 from food_visits v
                            where v.place_id = p.id and v.user_id = (select u from me))) x,
        (case when vid is not null then 2 when cov is not null then 1 else 0 end) rank,
        hashtext(p.id::text || ch.slug) mix
      from food_place_sources fs
      join food_places p on p.id = fs.place_id and p.status = 'live'
      left join food_stats st on st.place_id = p.id
      cross join lateral (
        select (select f2.video_id from food_place_sources f2
                 where f2.place_id = p.id and f2.channel = ch.slug
                   and f2.video_id is not null limit 1) vid,
               food_cover(p.id) cov
      ) img
      where fs.channel = ch.slug
      order by (case when vid is not null then 2 when cov is not null then 1 else 0 end) desc,
               hashtext(p.id::text || ch.slug)
      limit least(coalesce(p_per, 10), 30)
    ) q
  ) pl on true;
$$;
