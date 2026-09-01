-- 나라 카드 커버 폴백 (2026-09-01)
-- 실사진이 없는 나라는 국기만 덩그러니 떠서 카드가 비어 보인다(캐나다·아르헨티나 실측).
-- 규칙은 지키되(실사진 우선) **없을 때만** 영상 썸네일로 떨어진다 — 빈 카드보다 낫다.
create or replace function public.travel_country_cards(p_limit int default 40)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', true, 'countries', coalesce(jsonb_agg(x order by spots desc, code), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'code', p.country_code,
      'name', min(p.country) filter (where p.country is not null),
      'spots', count(*) filter (where p.scale = 'spot'),
      'creators', (select count(distinct ts.channel)
                     from travel_place_sources ts
                     join travel_places p2 on p2.id = ts.place_id
                    where p2.country_code = p.country_code and p2.status = 'live'),
      'cover', coalesce(
        (select p3.photo from travel_places p3
          where p3.country_code = p.country_code and p3.status = 'live' and p3.photo is not null
          order by (p3.scale = 'spot') desc, p3.created_at desc limit 1),
        (select travel_cover_video(p4.id, null) from travel_places p4
          where p4.country_code = p.country_code and p4.status = 'live' and p4.scale = 'spot'
          order by p4.created_at desc limit 1)),
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
grant execute on function public.travel_country_cards(int) to anon, authenticated;
