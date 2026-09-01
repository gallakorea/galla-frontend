-- 둘러보기 상단 대시보드 (2026-09-01)
-- 사장님: "나라들 위에 뭔가 데이터를 보여주면 좋겠다. 인기 여행지, 유튜버 최다 방문 여행지 같은."
--
-- ⚠️ 지금 유저 표(또 간다/찜)는 0이다. 그걸로 '인기 여행지'를 만들면 빈 화면이거나 거짓말이 된다.
--    우리가 **실제로 가진 것**은 크리에이터의 발자국이다. 그래서 세 축으로 간다:
--      ① 겹친 곳   — 서로 다른 유튜버 몇 명이 다녀갔나. 이게 우리만의 '검증된 여행지' 신호다.
--      ② 최근      — 요 근래 다녀간 곳(방영일 기준). '지금 뜨는 곳'의 대용이다.
--      ③ 나라 순위 — 유튜버가 가장 많이 간 나라.
--    표가 쌓이면 '또 간다 랭킹'과 '과대평가'를 여기 얹는다(travel_rank 가 이미 준비돼 있다).
create or replace function public.travel_dashboard(p_n int default 8)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with spots as (
    select p.id, p.name, p.country, p.country_code,
           coalesce(p.admin1, p.city) area, p.photo,
           travel_cover(p.id) cover,
           (select count(distinct ts.channel) from travel_place_sources ts where ts.place_id = p.id) chn,
           (select max(ts.aired_at) from travel_place_sources ts where ts.place_id = p.id) last_at
      from travel_places p
     where p.status = 'live' and p.scale = 'spot'
  )
  select jsonb_build_object(
    'ok', true,
    'totals', jsonb_build_object(
      'places',    (select count(*) from travel_places where status='live' and scale='spot'),
      'countries', (select count(distinct country_code) from travel_places
                     where status='live' and country_code is not null),
      'creators',  (select count(*) from travel_channels where active and yt_channel_id is not null),
      'videos',    (select count(*) from travel_videos)),
    /* ① 여러 유튜버가 겹친 곳 — 2명 이상만. 1명은 '겹침'이 아니다. */
    'multi', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'name', name, 'country', country, 'country_code', country_code,
               'area', area, 'cover', cover, 'n', chn) order by chn desc, last_at desc nulls last)
        from (select * from spots where chn >= 2 order by chn desc, last_at desc nulls last
               limit least(coalesce(p_n,8), 20)) a), '[]'::jsonb),
    /* ② 최근 다녀간 곳 */
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'name', name, 'country', country, 'country_code', country_code,
               'area', area, 'cover', cover, 'at', last_at) order by last_at desc)
        from (select * from spots where last_at is not null
               order by last_at desc limit least(coalesce(p_n,8), 20)) b), '[]'::jsonb),
    /* ③ 유튜버가 많이 간 나라 */
    'countries', coalesce((
      select jsonb_agg(jsonb_build_object('code', code, 'name', nm, 'n', n, 'chn', chn)
                       order by n desc)
        from (select s.country_code code, min(s.country) nm, count(*) n,
                     count(distinct ts.channel) chn
                from spots s
                join travel_place_sources ts on ts.place_id = s.id
               where s.country_code is not null
               group by s.country_code
               order by count(*) desc limit least(coalesce(p_n,8), 20)) c), '[]'::jsonb));
$fn$;
grant execute on function public.travel_dashboard(int) to anon, authenticated;
