-- 지도는 최신순이 아니라 '고르게'여야 한다 — 데이터가 늘수록 심해지는 쏠림을 끊는다.
-- ⚠️ 파라미터를 더할 때는 반드시 옛 시그니처를 먼저 지운다. 둘이 공존하면
--    PostgREST 가 어느 쪽인지 못 정해 오버로드 모호성으로 호출이 통째로 깨진다.
drop function if exists public.food_map(numeric,numeric,numeric,numeric,text,text,boolean,integer,text,integer);

CREATE OR REPLACE FUNCTION public.food_map(p_sw_lat numeric DEFAULT NULL::numeric, p_sw_lon numeric DEFAULT NULL::numeric, p_ne_lat numeric DEFAULT NULL::numeric, p_ne_lon numeric DEFAULT NULL::numeric, p_region text DEFAULT NULL::text, p_channel text DEFAULT NULL::text, p_only_unvisited boolean DEFAULT false, p_limit integer DEFAULT 300, p_category text DEFAULT NULL::text, p_min_shows integer DEFAULT NULL::integer, p_spread boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() u)
  select jsonb_build_object('ok', true, 'places', coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'address', p.address, 'region', p.region,
      'lat', p.lat, 'lon', p.lon, 'category', p.category, 'phone', p.phone,
      'created_at', p.created_at,
      'channels', coalesce(s.chs, '[]'::jsonb),
      'video_id', s.vid,
      'cover', (select ph.url from food_photos ph
                 where ph.place_id = p.id and ph.status='live' order by ph.id desc limit 1),
      'photos_n', (select count(*) from food_photos ph
                    where ph.place_id = p.id and ph.status='live'),
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
    /* p_spread — 지도 전용. 목록은 '최신순'이 맞지만 지도는 아니다.
       데이터가 1,100 → 5,000 곳으로 늘자 전국 화면에서 최신 400개만 잘려 나가면서
       **마지막에 수집된 채널 쪽으로 핀이 쏠렸다**. 나머지 지역은 텅 빈다.
       위경도를 격자로 접어 셀마다 돌아가며 뽑으면(=cell 안 순위로 정렬) 같은 400개라도
       전국에 고르게 흩어진다. 셀 안에서는 최신 우선이라 새 집이 먼저 보인다. */
    order by
      case when p_spread then
        row_number() over (
          partition by floor(coalesce(p.lat,0) * 8), floor(coalesce(p.lon,0) * 8)
          order by p.created_at desc)
      end nulls last,
      p.created_at desc
    limit least(coalesce(p_limit, 300), 1000)
  ) q;
$function$;


grant execute on function public.food_map(numeric,numeric,numeric,numeric,text,text,boolean,integer,text,integer,boolean) to anon, authenticated;
