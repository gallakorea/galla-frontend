-- 여행 탭 정보구조·사진 규칙 확정 (2026-09-01)
--
-- 사장님: "둘러보기 사진이랑 누가갔나 사진이 달라야 할 텐데 규칙이 없어 이상하다.
--          국가·도시·지역이 중구난방이라 혼란스럽다."
--
-- 규칙 ① **카드는 항상 '장소(spot)'다.** 나라·지역·도시는 카드가 아니라 내비게이션이다.
--   지금까진 한 목록에 '우간다'와 '돈키호테 롯폰기점'이 나란히 떴다. 축이 다른 것을
--   같은 카드로 늘어놓으면 유저는 이게 목적지 목록인지 장소 목록인지 알 수 없다.
--   지역 단위 행은 계속 쌓되(크리에이터가 어느 나라를 갔는지의 근거) 화면에선 칩·헤더로만 쓴다.
--
-- 규칙 ② **사진의 뜻을 화면마다 다르게 준다.**
--   · 둘러보기 = 장소 실사진 우선(위키데이터/관광공사) → "그곳이 어떤 곳인가"
--   · 누가 갔나 = 그 크리에이터의 영상 썸네일 우선      → "그 사람이 어떻게 담았나"
--   같은 사진을 두 화면에 쓰면 '누가 갔나'가 둘러보기의 복사본이 된다.

/* 영상 썸네일 우선 커버 — 채널을 지정하면 그 채널 영상만 본다(남의 영상이 붙으면 거짓말이 된다) */
create or replace function public.travel_cover_video(p_id uuid, p_channel text default null)
returns text language sql stable security definer set search_path to 'public' as $fn$
  select coalesce(
    (select 'https://i.ytimg.com/vi/' || ts.video_id || '/hqdefault.jpg'
       from travel_place_sources ts
      where ts.place_id = p_id and ts.video_id is not null
        and (p_channel is null or ts.channel = p_channel)
      order by ts.aired_at desc nulls last limit 1),
    (select p.photo from travel_places p where p.id = p_id));
$fn$;

/* ── 나라 그리드 — 둘러보기의 1계층 ────────────────────
   대표 사진은 **그 나라 장소들의 실사진** 중 하나다. 영상 썸네일로 대신하지 않는다 —
   나라 카드에 유튜브 썸네일이 박히면 '나라'가 아니라 '영상'처럼 보인다. */
create or replace function public.travel_country_cards(p_limit int default 40)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', true, 'countries', coalesce(jsonb_agg(x order by spots desc, code), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'code', p.country_code,
      'name', min(p.country) filter (where p.country is not null),
      'spots', count(*) filter (where p.scale = 'spot'),
      'areas', count(distinct coalesce(p.admin1, p.city)) filter (where p.scale = 'spot'),
      'creators', (select count(distinct ts.channel)
                     from travel_place_sources ts
                     join travel_places p2 on p2.id = ts.place_id
                    where p2.country_code = p.country_code and p2.status = 'live'),
      'cover', (select p3.photo from travel_places p3
                 where p3.country_code = p.country_code and p3.status = 'live'
                   and p3.photo is not null
                 order by (p3.scale = 'spot') desc, p3.created_at desc limit 1),
      'names', (select jsonb_agg(n) from (
                  select p4.name n from travel_places p4
                   where p4.country_code = p.country_code and p4.status='live' and p4.scale='spot'
                   order by (p4.photo is null), p4.created_at desc limit 3) t)
      ) x,
      count(*) filter (where p.scale = 'spot') spots,
      p.country_code code
    from travel_places p
    where p.status = 'live' and p.country_code is not null
    group by p.country_code
    having count(*) filter (where p.scale = 'spot') > 0
    order by count(*) filter (where p.scale = 'spot') desc
    limit least(coalesce(p_limit, 40), 100)
  ) q;
$fn$;

/* ── 누가 갔나 — 커버를 영상 썸네일 우선으로 바꾼다 ──── */
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
      join travel_places p on p.id = ts.place_id and p.status = 'live' and p.scale = 'spot'
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
    select jsonb_agg(x order by created_at desc) arr from (
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'city', coalesce(p.admin1, p.city), 'country', p.country,
        'country_code', p.country_code, 'scale', p.scale, 'kind', p.kind,
        'cover', travel_cover_video(p.id, ch.slug),   -- ← 그 크리에이터의 영상 썸네일 우선
        'visited', exists (select 1 from travel_visits v
                            where v.place_id = p.id and v.user_id = (select u from me))) x,
        p.created_at
      from (
        select distinct p2.*
          from travel_place_sources ts2
          join travel_places p2 on p2.id = ts2.place_id
                               and p2.status = 'live' and p2.scale = 'spot'
         where ts2.channel = ch.slug
      ) p
      order by p.created_at desc
      limit least(coalesce(p_per, 10), 30)
    ) q
  ) pl on true;
$fn$;

/* ── 지도 — 나라 핀은 뺀다 ─────────────────────────────
   나라 행의 좌표는 '나라 중심점'이라 아무 데도 아닌 들판에 핀이 꽂힌다. */
create or replace function public.travel_map(p_south numeric, p_west numeric,
                                             p_north numeric, p_east numeric,
                                             p_limit int default 300)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', true, 'places', coalesce(jsonb_agg(x), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'lat', p.lat, 'lon', p.lon,
      'scale', p.scale, 'kind', p.kind, 'city', coalesce(p.admin1, p.city),
      'country', p.country, 'country_code', p.country_code,
      'cover', travel_cover(p.id),
      'ch_name', ch.name, 'ch_thumb', ch.thumb, 'ch_n', ch.n) x
    from (
      select p.*, row_number() over (
               partition by round(p.lat::numeric, 0), round(p.lon::numeric, 0)
               order by (p.photo is null), p.created_at desc) rn
        from travel_places p
       where p.status = 'live' and p.lat is not null
         and p.scale in ('spot','city')          -- 나라·광역 중심점은 핀으로 뜻이 없다
         and p.lat between p_south and p_north
         and p.lon between p_west  and p_east
    ) p
    left join lateral (
      select c.name, c.thumb,
             (select count(distinct ts2.channel) from travel_place_sources ts2 where ts2.place_id = p.id) n
        from travel_place_sources ts
        join travel_channels c on c.slug = ts.channel
       where ts.place_id = p.id
       order by ts.aired_at desc nulls last
       limit 1
    ) ch on true
    where p.rn <= 8
    order by p.rn
    limit least(coalesce(p_limit, 300), 800)
  ) q;
$fn$;

grant execute on function public.travel_cover_video(uuid,text)  to anon, authenticated;
grant execute on function public.travel_country_cards(int)      to anon, authenticated;
