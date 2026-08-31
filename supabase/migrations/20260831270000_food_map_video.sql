-- 목록 카드에 영상 썸네일을 쓰려면 video_id 가 필요하다 (2026-08-31)
-- 시그니처는 그대로 두고 반환 JSON 에 필드만 더한다(오버로드가 생기지 않는다).
create or replace function public.food_map(
  p_sw_lat numeric default null, p_sw_lon numeric default null,
  p_ne_lat numeric default null, p_ne_lon numeric default null,
  p_region text default null, p_channel text default null,
  p_only_unvisited boolean default false, p_limit int default 300,
  p_category text default null, p_min_shows int default null)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with me as (select auth.uid() u)
  select jsonb_build_object('ok', true, 'places', coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'address', p.address, 'region', p.region,
      'lat', p.lat, 'lon', p.lon, 'category', p.category, 'phone', p.phone,
      'created_at', p.created_at,
      'channels', coalesce(s.chs, '[]'::jsonb),
      'video_id', s.vid,
      'good', coalesce(st.good,0), 'bad', coalesce(st.bad,0),
      'visited', v.place_id is not null,
      'saved',   sv.place_id is not null) x
    from food_places p
    left join lateral (
      select jsonb_agg(distinct c.slug) chs, count(distinct c.slug) n,
             (array_agg(fs.video_id) filter (where fs.video_id is not null))[1] vid
        from food_place_sources fs join food_channels c on c.slug = fs.channel
       where fs.place_id = p.id) s on true
    left join food_stats st on st.place_id = p.id
    left join food_visits v on v.place_id = p.id and v.user_id = (select u from me)
    left join food_saves  sv on sv.place_id = p.id and sv.user_id = (select u from me)
    where p.status = 'live'
      and (p_region  is null or p.region = p_region)
      and (p_sw_lat  is null or (p.lat between p_sw_lat and p_ne_lat
                             and p.lon between p_sw_lon and p_ne_lon))
      and (p_channel is null or exists (
            select 1 from food_place_sources f2 where f2.place_id = p.id and f2.channel = p_channel))
      and (p_category is null or p.category = p_category)
      and (p_min_shows is null or coalesce(s.n,0) >= p_min_shows)
      and (not p_only_unvisited or v.place_id is null)
    order by p.created_at desc
    limit least(coalesce(p_limit, 300), 1000)
  ) q;
$fn$;
grant execute on function public.food_map(numeric,numeric,numeric,numeric,text,text,boolean,int,text,int)
  to anon, authenticated;
select (food_map(p_limit:=1)->'places'->0) ? 'video_id' as has_vid;
