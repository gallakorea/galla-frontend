-- 방송별 섹션이 로고 타일로 도배됐던 진짜 이유 — 데이터가 없어서가 아니라 **순서가 틀려서**다.
--
-- 섹션은 채널당 10곳을 created_at desc(최신순)로 골랐다. 그런데 최신 등록일수록
-- 사진 수집 큐에 아직 안 걸린 집이라, 사진이 있는 집이 화면에 거의 안 왔다.
--   실측: 또간집 322곳 중 145곳(45%)에 사진이 있는데 섹션 10칸은 거의 다 이름 타일이었다.
--
-- → 그림이 있는 집을 먼저 세운다. 영상 > 사진 > 없음.
--   ⚠️ 최신순을 버리는 게 아니라 2차 정렬로 남긴다 — 같은 등급 안에서는 최신이 먼저다.
--   ⚠️ 카드 이미지 없는 집을 숨기지는 않는다. 10칸을 못 채우면 그때는 타일이라도 세운다
--      (섹션이 통째로 비는 것보다 낫다).
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
    select jsonb_agg(x order by rank desc, ord desc) arr from (
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'address', p.address,
        'lat', p.lat, 'lon', p.lon, 'category', p.category,
        'video_id', vid, 'cover', cov,
        'good', coalesce(st.good, 0), 'bad', coalesce(st.bad, 0),
        'visited', exists (select 1 from food_visits v
                            where v.place_id = p.id and v.user_id = (select u from me))) x,
        (case when vid is not null then 2 when cov is not null then 1 else 0 end) rank,
        p.created_at ord
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
      /* 그림 있는 집을 먼저 훑되, 후보를 넉넉히 본 뒤에 자른다 —
         최신 10곳만 떠서 고르면 그 10곳에 사진이 없을 때 그대로 타일 10칸이 된다. */
      order by (case when vid is not null then 2 when cov is not null then 1 else 0 end) desc,
               p.created_at desc
      limit least(coalesce(p_per, 10), 30)
    ) q
  ) pl on true;
$$;
