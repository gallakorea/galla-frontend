-- 방송별 모아보기 (2026-08-31)
--
-- 사장님: "얘들은 방송 모아 보기도 있는데 우리 방식으로 껴넣어."
--   저쪽은 방송별로 집을 나열하고 끝나는 읽기 전용 디렉터리다.
--   우리는 같은 화면에 **정복률(도장깨기)** 과 **맛있다/맛없다 전적**을 같이 얹는다.
--   같은 목록이라도 "몇 곳 남았나 / 이 집 진짜 맛있나"가 보이면 완전히 다른 화면이 된다.
--
-- 한 번의 호출로 화면 전체를 그린다 — 채널 20여 개에 각각 질의하면 왕복이 폭발한다.
create or replace function public.food_browse(p_per int default 10, p_channels int default 12)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
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
    select jsonb_agg(x order by ord) arr from (
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'address', p.address,
        'lat', p.lat, 'lon', p.lon, 'category', p.category,
        -- 출처 영상의 유튜브 썸네일을 카드 이미지로 쓴다(재호스팅 아님, 표준 URL 참조)
        'video_id', (select f2.video_id from food_place_sources f2
                      where f2.place_id = p.id and f2.channel = ch.slug
                        and f2.video_id is not null limit 1),
        'good', coalesce(st.good, 0), 'bad', coalesce(st.bad, 0),
        'visited', exists (select 1 from food_visits v
                            where v.place_id = p.id and v.user_id = (select u from me))) x,
        p.created_at ord
      from food_place_sources fs
      join food_places p on p.id = fs.place_id and p.status = 'live'
      left join food_stats st on st.place_id = p.id
      where fs.channel = ch.slug
      order by p.created_at desc
      limit least(coalesce(p_per, 10), 30)
    ) q
  ) pl on true;
$fn$;
grant execute on function public.food_browse(int,int) to anon, authenticated;
select jsonb_array_length(food_browse(3,5)->'sections') as sections;
