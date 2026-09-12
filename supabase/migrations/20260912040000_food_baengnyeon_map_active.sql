-- 맛집: 백년가게 되살리기 + 지도가 꺼 둔 출처를 세던 것 (2026-09-12 사장님 승인 "진행")
--
-- ① 백년가게(guide, 823곳)는 09-04 명단 정리 때 '팬 채널 yt_channel_id 비우기'와 한 줄로 묶여
--    active=false 가 됐다(20260904980000_channel_roster). 그런데 백년가게는 중기부 지정 공공데이터를
--    네이버 검증해 넣은 **인증 출처**라 영상이 원래 없는 게 정상이다(출처 823행 전부 video_id null).
--    → 다시 켠다. 단 수집기가 yt_query('백년가게')로 유튜브 이름 검색을 돌려 **팬 채널을 또 잡지 않게**
--      yt_query·yt_channel_id 를 비우고 harvest=false 로 둔다(수집기: active·non-gov·yt_query not null 이 해소 대상).
--    다이닝코드(136곳)는 사설 랭킹 사이트라 데이터 권리 확인 전까지 꺼 둔다.
--
-- ② 지도(food_map)는 출처를 셀 때 채널 active 를 안 봐서, 꺼 둔 출처만 붙은 가게 760곳이
--    지도에선 '누가 다녀간 곳'으로 세지는데 상세(food_place_detail, active 만)는 비어 있었다.
--    → 지도도 active 채널만 센다. 시그니처 그대로라 오버로드 없음.

update food_channels set active = true, harvest = false, yt_query = null, yt_channel_id = null
 where slug = 'baengnyeon';

select food_channel_counts_refresh();

CREATE OR REPLACE FUNCTION public.food_map(p_sw_lat numeric DEFAULT NULL::numeric, p_sw_lon numeric DEFAULT NULL::numeric, p_ne_lat numeric DEFAULT NULL::numeric, p_ne_lon numeric DEFAULT NULL::numeric, p_region text DEFAULT NULL::text, p_channel text DEFAULT NULL::text, p_only_unvisited boolean DEFAULT false, p_limit integer DEFAULT 300, p_category text DEFAULT NULL::text, p_min_shows integer DEFAULT NULL::integer, p_spread boolean DEFAULT false, p_good_price boolean DEFAULT false, p_max_price integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        from food_place_sources fs join food_channels c on c.slug = fs.channel and c.active   -- 꺼 둔 출처는 세지 않는다(상세와 같은 기준)
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
end $function$;
