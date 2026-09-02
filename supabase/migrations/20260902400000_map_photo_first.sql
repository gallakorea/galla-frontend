-- 목록이 **사진 있는 집부터** 나오게 한다.
--
-- ⚠️ food_map 은 파라미터 이름이 같은 오버로드를 만들면 PostgREST 가 못 고른다(42725).
--    반드시 **원래 시그니처 그대로** create or replace 해야 한다. 새로 쓰지 말 것.
--    (실수로 인자 순서를 바꿔 만들었다가 앱이 잠깐 죽었다 — 즉시 drop 으로 복구.)
--
-- 정렬을 **두 군데** 고쳐야 한다. 하나만 고치면 원래대로 돌아간다:
--   ① 안쪽 order by  — 전체에서 어떤 400곳이 뽑히느냐
--   ② 바깥 jsonb_agg — 뽑힌 400곳을 화면에 어떤 순서로 세우느냐
CREATE OR REPLACE FUNCTION public.food_map(p_sw_lat numeric DEFAULT NULL::numeric, p_sw_lon numeric DEFAULT NULL::numeric, p_ne_lat numeric DEFAULT NULL::numeric, p_ne_lon numeric DEFAULT NULL::numeric, p_region text DEFAULT NULL::text, p_channel text DEFAULT NULL::text, p_only_unvisited boolean DEFAULT false, p_limit integer DEFAULT 300, p_category text DEFAULT NULL::text, p_min_shows integer DEFAULT NULL::integer, p_spread boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() u)
  select jsonb_build_object('ok', true, 'places', coalesce(jsonb_agg(x order by ((x->>'cover') is not null) desc, x->>'created_at' desc), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'address', p.address, 'region', p.region,
      'lat', p.lat, 'lon', p.lon, 'category', p.category, 'phone', p.phone,
      -- 목록 카드에도 영업시간·평점을 얹는다(구글에서 사진과 같은 호출로 받은 것)
      'hours', p.hours, 'rating', p.rating, 'rating_n', p.rating_n,
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
    /* 🔴 사진 있는 집을 먼저 뽑는다(실측 2026-09-02 시뮬).
       어제·오늘 들어온 최신 데이터가 관광공사(사진 71%)가 아니라 착한가격(사진 0.6%)이라
       'created_at desc' 로 자른 400곳이 통째로 사진 없는 집이었다. 맛집 탭 첫 화면이
       전부 초성 타일이 됐고, 클라이언트는 받은 400곳 안에서만 다시 정렬하므로
       '최신·가까운·화제' 세 버튼이 같은 화면을 냈다(판정 0이라 heat 도 동점). */
    order by
      case when p_spread then
        row_number() over (
          partition by floor(coalesce(p.lat,0) * 8), floor(coalesce(p.lon,0) * 8)
          order by (exists (select 1 from food_photos phz where phz.place_id = p.id and phz.status='live')) desc, p.created_at desc)
      end nulls last,
      (exists (select 1 from food_photos phz where phz.place_id = p.id and phz.status='live')) desc,
      p.created_at desc
    limit least(coalesce(p_limit, 300), 1000)
  ) q;
$function$
