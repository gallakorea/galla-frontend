-- 🍚 혜자식당 = 씨앗(외부 제공 목록) + 우리 데이터. 씨앗이 기본이고 우리 것이 추가다.
-- ⚠️ food_map 은 인자 이름이 겹치는 오버로드가 생기면 PostgREST 가 못 고른다(42725).
--    시그니처는 그대로 두고 본문만 바꾼다 — 인자를 더하지 않았으니 drop 이 필요 없다.
CREATE OR REPLACE FUNCTION public.food_map(p_sw_lat numeric DEFAULT NULL::numeric, p_sw_lon numeric DEFAULT NULL::numeric, p_ne_lat numeric DEFAULT NULL::numeric, p_ne_lon numeric DEFAULT NULL::numeric, p_region text DEFAULT NULL::text, p_channel text DEFAULT NULL::text, p_only_unvisited boolean DEFAULT false, p_limit integer DEFAULT 300, p_category text DEFAULT NULL::text, p_min_shows integer DEFAULT NULL::integer, p_spread boolean DEFAULT false, p_good_price boolean DEFAULT false, p_max_price integer DEFAULT NULL::integer)
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
      /* 목록 카드가 🏷 칩을 그리려면 내려줘야 한다 — 필터만 걸고 안 주면 화면이 모른다 */
      'good_price', p.good_price,
      'min_price', p.min_price,
      'cheap_seed', p.cheap_seed,
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
      /* 🏷 착한가격업소만 보기. 정부가 가격·위생·서비스를 실사해 지정한 집이라
         '가성비'를 사람 제보가 아니라 고시로 보증한다 — 우리만 가진 축이다. */
      and (not p_good_price or p.good_price)
      /* 🍚 천원식당 — 값이 곧 기준이다. 다이소·달러샵처럼 이름은 가격 보증이 아니라
         카테고리 선언이라, 만원 넘지 않는 선(8,000원)까지 담는다.
         ⚠️ 해외 통화가 원화처럼 섞여 있다(베이징 '작장면 38원'=38위안). 한반도 안만 센다. */
      /* 🍚 혜자식당 = **외부에서 받은 목록(씨앗)** + 우리가 가진 싼 집.
         씨앗은 값이 확인된 자료라 가격 조건 없이 들어오고, 우리 것은 8,000원 이하만 얹는다. */
      and (p_max_price is null or p.cheap_seed
           or (p.min_price is not null and p.min_price <= p_max_price
               and p.lat between 33 and 39.5 and p.lon between 124 and 132))
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
      /* 🔴 천원식당은 **싼 순**이 기본이다. 사진순으로 내면 8,000원짜리가 앞에 서서
         이름이 거짓말처럼 읽힌다. 필터가 켜졌을 때만 값 우선으로 뒤집는다. */
      /* 씨앗이 기본이다 — 먼저 세우고, 그 안에서 싼 순. 우리 것이 뒤를 채운다. */
      case when p_max_price is not null then (not p.cheap_seed) end asc,
      case when p_max_price is not null then p.min_price end asc nulls last,
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
