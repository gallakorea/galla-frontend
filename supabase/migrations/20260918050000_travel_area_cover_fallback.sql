-- 여행 지역 카드: 지역 사진이 비면 그 지역 대표 장소 사진으로 채운다(26.9.18 사장님 「태국 지역 사진 빈데 왜케 많아」)
-- 실측: 지역 1,769곳 중 409곳이 빈 타일(travel_area_photos 행은 있는데 photo 가 null — 481행). 그중 376곳은
--       그 지역 장소에 사진이 있다(끄라비 주: 장소 45곳 중 42곳 사진 보유인데 타일은 백지).
-- 대표 = 영상에 가장 많이 나온 장소. 출처 조인으로 장소 행이 영상 수만큼 늘어나므로 mode() 가 곧 '가장 많이 나온 사진'.
create or replace function public.travel_area_cards(p_country text, p_limit integer default 30)
returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  select jsonb_build_object('ok', true, 'areas', coalesce(jsonb_agg(x order by spots desc, nm), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'name', g.nm, 'spots', g.spots, 'creators', g.creators,
      'cover',  coalesce(ap.photo, g.fb_photo),
      'credit', case when ap.photo is not null then ap.credit
                     else (select p2.photo_credit from travel_places p2 where p2.photo = g.fb_photo limit 1) end,
      'names', g.names) x, g.spots, g.nm
    from (
      select /* ⚠️ 국내는 city 폴백을 안 쓴다 — '동해시'·'옹진군'이 시도 자리에 올라와 섞였다.
                해외는 광역이 없는 나라가 많아 폴백이 필요하다. */
             case when upper(p_country) = 'KR' then p.admin1
                  else coalesce(p.admin1, p.city) end nm,
             count(distinct p.id) spots,
             count(distinct ts.channel) creators,
             mode() within group (order by p.photo) filter (where p.photo is not null) fb_photo,
             jsonb_agg(distinct p.name) names
        from travel_places p
        left join travel_place_sources ts on ts.place_id = p.id
       where p.status='live' and p.scale='spot' and p.country_code = upper(p_country)
       group by 1
      having (case when upper(p_country) = 'KR' then p.admin1
                   else coalesce(p.admin1, p.city) end) is not null
    ) g
    left join travel_area_photos ap on ap.scope = 'area' and ap.code = upper(p_country) || '|' || g.nm
    limit least(coalesce(p_limit, 30), 60)
  ) q;
$function$;
