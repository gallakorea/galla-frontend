-- 여행 탭 읽기 표면 (2026-09-01)
--
-- 화면은 셋이다.
--   ① 피드   travel_feed      — 나라·종류 필터가 걸린 카드 목록
--   ② 누가갔나 travel_browse   — 크리에이터별 섹션(맛집과 같은 구조)
--   ③ 지도   travel_map       — bbox 안의 핀. 좌표 있는 live 행만.
--   ④ 상세   travel_place_info — 장소 + 그 곳이 나온 영상들 + 판정 현황 + 내 표
--
-- ⚠️ 사진이 없는 행이 대부분이다(위키데이터에 사진이 있는 건 유명한 곳뿐).
--    그래서 커버는 사진 → **그 곳이 나온 영상 썸네일** 순으로 떨어진다.
--    맛집도 카드가 통째로 🍜 플레이스홀더였던 시기가 있었고, 영상 썸네일이 그걸 살렸다.
-- ⚠️ 지도에는 status='live'(좌표 있는 것)만 올린다. pending 은 목록·상세에서만 쓴다.

/* 커버 한 장 — 사진이 없으면 영상 썸네일. i.ytimg.com 은 유튜브 공식 CDN 이라 재호스팅이 아니다. */
create or replace function public.travel_cover(p_id uuid)
returns text language sql stable security definer set search_path to 'public' as $fn$
  select coalesce(
    (select p.photo from travel_places p where p.id = p_id and p.photo is not null),
    (select 'https://i.ytimg.com/vi/' || ts.video_id || '/hqdefault.jpg'
       from travel_place_sources ts
      where ts.place_id = p_id and ts.video_id is not null
      order by ts.aired_at desc nulls last limit 1));
$fn$;

/* ── ① 피드 ────────────────────────────────────────────
   정렬은 '사진 있는 것 먼저'가 기본이다. 최신순으로 두면 커버 없는 카드가 화면을 덮는다. */
create or replace function public.travel_feed(p_scale text default null,
                                              p_country text default null,
                                              p_kind text default null,
                                              p_limit int default 30,
                                              p_offset int default 0)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with me as (select auth.uid() u)
  select jsonb_build_object('ok', true, 'places', coalesce(jsonb_agg(x order by ord, id_txt), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'name_en', p.name_en, 'city', p.city,
      'country', p.country, 'country_code', p.country_code,
      'scale', p.scale, 'kind', p.kind, 'category', p.category,
      'lat', p.lat, 'lon', p.lon,
      'cover', travel_cover(p.id), 'photo_credit', p.photo_credit,
      'geo_source', p.geo_source,
      'again', coalesce(s.again,0), 'once', coalesce(s.once,0),
      'want', coalesce(s.want,0), 'pass', coalesce(s.pass,0),
      'mine', (select v.verdict from travel_votes v
                where v.place_id = p.id and v.user_id = (select u from me)),
      'channels', coalesce((select jsonb_agg(distinct c.name)
                             from travel_place_sources ts
                             join travel_channels c on c.slug = ts.channel
                            where ts.place_id = p.id), '[]'::jsonb)) x,
      (case when p.photo is not null then 0 else 1 end) ord,
      p.id::text id_txt
    from travel_places p
    left join travel_stats s on s.place_id = p.id
    where p.status = 'live'
      and (p_scale is null or p.scale = p_scale)
      and (p_country is null or p.country_code = upper(p_country))
      and (p_kind is null or p.kind = p_kind)
    order by (case when p.photo is not null then 0 else 1 end), p.created_at desc
    limit least(coalesce(p_limit, 30), 60) offset greatest(coalesce(p_offset, 0), 0)
  ) q;
$fn$;

/* ── ② 누가 갔나 — 크리에이터별 섹션 ──────────────────── */
create or replace function public.travel_browse(p_per int default 10, p_channels int default 12)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with me as (select auth.uid() u),
  ch as (
    select c.slug, c.name, c.thumb, c.lang,
           count(distinct p.id) total,
           count(distinct p.id) filter (
             where exists (select 1 from travel_visits v
                            where v.place_id = p.id and v.user_id = (select u from me))) mine
      from travel_channels c
      join travel_place_sources ts on ts.channel = c.slug
      join travel_places p on p.id = ts.place_id and p.status = 'live'
     where c.active
     group by c.slug, c.name, c.thumb, c.lang
    having count(distinct p.id) > 0
     order by count(distinct p.id) desc
     limit least(coalesce(p_channels, 12), 30)
  )
  select jsonb_build_object('ok', true, 'sections',
    coalesce(jsonb_agg(jsonb_build_object(
      'slug', ch.slug, 'name', ch.name, 'thumb', ch.thumb, 'lang', ch.lang,
      'total', ch.total, 'visited', ch.mine,
      'pct', case when ch.total > 0 then round(ch.mine::numeric * 100 / ch.total) else 0 end,
      'places', coalesce(pl.arr, '[]'::jsonb)
    ) order by ch.total desc), '[]'::jsonb))
  from ch
  left join lateral (
    select jsonb_agg(x order by ord) arr from (
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'city', p.city, 'country', p.country,
        'scale', p.scale, 'kind', p.kind, 'lat', p.lat, 'lon', p.lon,
        'cover', travel_cover(p.id),
        'visited', exists (select 1 from travel_visits v
                            where v.place_id = p.id and v.user_id = (select u from me))) x,
        (case when p.photo is not null then 0 else 1 end) ord
      from travel_place_sources ts
      join travel_places p on p.id = ts.place_id and p.status = 'live'
     where ts.channel = ch.slug
     order by (case when p.photo is not null then 0 else 1 end), p.created_at desc
     limit least(coalesce(p_per, 10), 30)
    ) q
  ) pl on true;
$fn$;

/* ── ③ 지도 ────────────────────────────────────────────
   ⚠️ 맛집에서 배운 것: 데이터가 늘수록 지도가 '마지막에 훑은 채널'로 쏠렸다.
      created_at desc 로 자르면 그렇게 된다. 격자 셀별 라운드로빈으로 흩뿌린다. */
create or replace function public.travel_map(p_south numeric, p_west numeric,
                                             p_north numeric, p_east numeric,
                                             p_limit int default 300)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', true, 'places', coalesce(jsonb_agg(x), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'lat', p.lat, 'lon', p.lon,
      'scale', p.scale, 'kind', p.kind, 'city', p.city, 'country', p.country,
      'cover', travel_cover(p.id)) x
    from (
      select p.*, row_number() over (
               partition by round(p.lat::numeric, 0), round(p.lon::numeric, 0)
               order by (p.photo is null), p.created_at desc) rn
        from travel_places p
       where p.status = 'live' and p.lat is not null
         and p.lat between p_south and p_north
         and p.lon between p_west  and p_east
    ) p
    where p.rn <= 8
    order by p.rn
    limit least(coalesce(p_limit, 300), 800)
  ) q;
$fn$;

/* ── ④ 상세 ──────────────────────────────────────────── */
create or replace function public.travel_place_info(p_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with me as (select auth.uid() u)
  select jsonb_build_object('ok', p.id is not null,
    'place', jsonb_build_object(
      'id', p.id, 'name', p.name, 'name_local', p.name_local, 'name_en', p.name_en,
      'city', p.city, 'country', p.country, 'country_code', p.country_code,
      'address', p.address, 'lat', p.lat, 'lon', p.lon,
      'scale', p.scale, 'kind', p.kind, 'category', p.category, 'status', p.status,
      'cover', travel_cover(p.id), 'photo_credit', p.photo_credit,
      'geo_source', p.geo_source, 'wikidata_qid', p.wikidata_qid),
    'stats', jsonb_build_object(
      'again', coalesce(s.again,0), 'once', coalesce(s.once,0),
      'want', coalesce(s.want,0), 'pass', coalesce(s.pass,0),
      'comments', coalesce(s.comments,0),
      'heat', round(coalesce(s.heat,0),2), 'hype', round(coalesce(s.hype,0),2)),
    'mine', (select v.verdict from travel_votes v
              where v.place_id = p.id and v.user_id = (select u from me)),
    'videos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'video_id', ts.video_id, 'title', ts.video_title,
               'channel', c.name, 'channel_slug', c.slug, 'thumb', c.thumb,
               'aired_at', ts.aired_at) order by ts.aired_at desc nulls last)
        from travel_place_sources ts
        join travel_channels c on c.slug = ts.channel
       where ts.place_id = p.id and ts.video_id is not null), '[]'::jsonb))
  from travel_places p
  left join travel_stats s on s.place_id = p.id
  where p.id = p_id and p.status in ('live','pending');
$fn$;

/* ── ⑤ 나라 칩 ────────────────────────────────────────
   전 세계라 칩이 200개가 될 수 있다. 장소가 있는 나라만, 많은 순으로 준다. */
create or replace function public.travel_countries(p_limit int default 40)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', true, 'countries', coalesce(jsonb_agg(x order by n desc), '[]'::jsonb))
  from (
    select jsonb_build_object('code', country_code, 'name', min(country), 'n', count(*)) x,
           count(*) n
      from travel_places
     where status = 'live' and country_code is not null
     group by country_code
     order by count(*) desc
     limit least(coalesce(p_limit, 40), 120)
  ) q;
$fn$;

grant execute on function public.travel_cover(uuid)                          to anon, authenticated;
grant execute on function public.travel_feed(text,text,text,int,int)         to anon, authenticated;
grant execute on function public.travel_browse(int,int)                      to anon, authenticated;
grant execute on function public.travel_map(numeric,numeric,numeric,numeric,int) to anon, authenticated;
grant execute on function public.travel_place_info(uuid)                     to anon, authenticated;
grant execute on function public.travel_countries(int)                       to anon, authenticated;
