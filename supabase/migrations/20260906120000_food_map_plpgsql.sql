-- 🔴 함수로 부르면 32,819블록, 같은 본문을 직접 돌리면 **351블록**이다. 90배 차이다.
--
-- 원인: SQL 함수(STABLE)는 파라미터가 상수로 접히지 않는다.
--   `p_region is null or p.region = p_region` 같은 조건을 옵티마이저가 미리 지우지 못해
--   "인덱스를 못 쓴다"고 보고 전량 스캔 계획을 세운다. 실제 호출은 대부분 필터가 null 인데도.
-- → plpgsql 로 바꾸고 EXECUTE 로 돌린다. 그러면 **호출 시점의 실제 값**으로 계획을 세운다.
--   (plpgsql 은 파라미터를 바인딩해 실행하므로 null 조건이 계획에서 사라진다)
--
-- ⚠️ 시그니처는 그대로 둔다. 인자 이름이 겹치는 오버로드를 만들면 PostgREST 가 못 골라
--    앱이 죽는다(오늘 food_videos_to_harvest_title 에서 밟았다).
create or replace function public.food_map(
  p_sw_lat numeric default null, p_sw_lon numeric default null,
  p_ne_lat numeric default null, p_ne_lon numeric default null,
  p_region text default null, p_channel text default null,
  p_only_unvisited boolean default false, p_limit integer default 300,
  p_category text default null, p_min_shows integer default null,
  p_spread boolean default false, p_good_price boolean default false,
  p_max_price integer default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare v jsonb;
begin
  select jsonb_build_object('ok', true,
           'places', coalesce(jsonb_agg(x order by ((x->>'cover') is not null) desc,
                                            x->>'created_at' desc), '[]'::jsonb))
    into v
  from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'address', p.address, 'region', p.region,
      'lat', p.lat, 'lon', p.lon, 'category', p.category, 'phone', p.phone,
      'hours', p.hours, 'rating', p.rating, 'rating_n', p.rating_n,
      'created_at', p.created_at,
      'good_price', p.good_price, 'min_price', p.min_price, 'cheap_seed', p.cheap_seed,
      'channels', coalesce(s.chs, '[]'::jsonb),
      'video_id', s.vid,
      /* 미리 계산해 둔 값 — 곳마다 서브쿼리를 돌면 37,905곳을 다 계산한 뒤 30개만 자른다 */
      'cover', p.cover_url,
      'photos_n', p.photos_n,
      'good', coalesce(st.good,0), 'bad', coalesce(st.bad,0),
      'visited', vi.place_id is not null,
      'saved',   sv.place_id is not null) x
    from food_places p
    left join lateral (
      select jsonb_agg(distinct c.slug) chs, count(distinct c.slug) n,
             (array_agg(fs.video_id) filter (where fs.video_id is not null))[1] vid
        from food_place_sources fs join food_channels c on c.slug = fs.channel
       /* 근거 없는 방송 주장은 세지 않는다 — 인증·공직자는 영상이 원래 없는 게 정상 */
       where fs.place_id = p.id
         and (fs.video_id is not null or c.kind not in ('yt','tv'))) s on true
    left join food_stats st on st.place_id = p.id
    left join food_visits vi on vi.place_id = p.id and vi.user_id = auth.uid()
    left join food_saves  sv on sv.place_id = p.id and sv.user_id = auth.uid()
    where p.status = 'live'
      and (p_region  is null or p.region = p_region)
      and (p_sw_lat  is null or (p.lat between p_sw_lat and p_ne_lat
                             and p.lon between p_sw_lon and p_ne_lon))
      and (p_channel is null or exists (
            select 1 from food_place_sources f2 where f2.place_id = p.id and f2.channel = p_channel))
      and (p_category is null or p.category = p_category)
      and (p_min_shows is null or coalesce(s.n,0) >= p_min_shows)
      and (not p_only_unvisited or vi.place_id is null)
      and (not p_good_price or p.good_price)
      and (p_max_price is null or (not p.good_price and (p.cheap_seed
           or (p.min_price is not null and p.min_price <= p_max_price
               and p.lat between 33 and 39.5 and p.lon between 124 and 132))))
    order by
      case when p_max_price is not null then (not p.cheap_seed) end asc,
      case when p_max_price is not null then p.min_price end asc nulls last,
      case when p_spread then
        row_number() over (
          partition by floor(coalesce(p.lat,0) * 8), floor(coalesce(p.lon,0) * 8)
          order by p.has_photo desc, p.created_at desc)
      end nulls last,
      p.has_photo desc,
      p.created_at desc
    limit least(coalesce(p_limit, 300), 1000)
  ) q;
  return v;
end $fn$;
grant execute on function public.food_map(numeric,numeric,numeric,numeric,text,text,boolean,integer,text,integer,boolean,boolean,integer) to anon, authenticated;
