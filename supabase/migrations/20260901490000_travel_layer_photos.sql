-- 층별 사진 규칙 확정 (2026-09-01)
--   나라 카드 · 지역 카드 → 위키보이저 여행 배너(travel_area_photos). **영상 썸네일 금지**
--   장소 카드            → 장소 실사진 → 없으면 영상 썸네일(허용)
--   누가 갔나            → 그 크리에이터의 영상 썸네일(항상)

/* ── 나라 그리드 ── */
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
      /* 🚫 여기서 영상 썸네일로 떨어지지 않는다. 나라 카드에 유튜브 썸네일이 박히면
            '나라'가 아니라 '영상'이 된다(사장님 지적). 배너가 없으면 국기로 간다. */
      'cover',  (select a.photo  from travel_area_photos a
                  where a.scope='country' and a.code = p.country_code),
      'credit', (select a.credit from travel_area_photos a
                  where a.scope='country' and a.code = p.country_code),
      'names', (select jsonb_agg(n) from (
                  select p5.name n from travel_places p5
                   where p5.country_code = p.country_code and p5.status='live' and p5.scale='spot'
                   order by (p5.photo is null), p5.created_at desc limit 3) t)
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

/* ── 지역 그리드 — 나라와 장소 사이의 층 ──
   사장님: "도시도 (아름다운 사진이어야) 그렇고. 도시에서 들어가면 유튜브 썸네일이 뜨든지." */
create or replace function public.travel_area_cards(p_country text, p_limit int default 30)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', true, 'areas', coalesce(jsonb_agg(x order by spots desc, nm), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'name', g.nm,
      'spots', g.spots,
      'creators', g.creators,
      'cover',  (select a.photo  from travel_area_photos a
                  where a.scope='area' and a.code = upper(p_country) || '|' || g.nm),
      'credit', (select a.credit from travel_area_photos a
                  where a.scope='area' and a.code = upper(p_country) || '|' || g.nm),
      'names', g.names
      ) x, g.spots, g.nm
    from (
      select coalesce(p.admin1, p.city) nm,
             count(*) spots,
             count(distinct ts.channel) creators,
             jsonb_agg(p.name order by (p.photo is null), p.created_at desc) names
        from travel_places p
        left join travel_place_sources ts on ts.place_id = p.id
       where p.status='live' and p.scale='spot' and p.country_code = upper(p_country)
         and coalesce(p.admin1, p.city) is not null
       group by coalesce(p.admin1, p.city)
    ) g
    limit least(coalesce(p_limit, 30), 60)
  ) q;
$fn$;

grant execute on function public.travel_area_cards(text,int) to anon, authenticated;
