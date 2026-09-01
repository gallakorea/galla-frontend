-- 나라 카드 정렬 = 한국인 여행 수요 순서 (2026-09-01)
--
-- 사장님: "대한민국이 왼쪽 제일 위, 오른쪽 일본, 그 밑에 미국 중국 그다음 유명 여행 나라 순서로."
--
-- ⚠️ 장소 수로 정렬하면 수집이 어디까지 돌았는지가 화면 순서를 정한다 —
--    오늘은 중국이 1등이고 내일은 동티모르가 1등이 된다. 유저에겐 아무 뜻이 없는 순서다.
--    그래서 **수요 순서를 고정**하고, 목록에 없는 나라만 장소 수로 뒤에 붙인다.
-- ⚠️ 고정 순위 나라는 아직 스팟이 0이어도 자리를 지킨다(미국이 중간에 비면 순서가 깨진다).
--    대신 '0곳' 대신 '곧 채워져요'로 표시한다.
create or replace function public.travel_country_rank(p_cc text)
returns int language sql immutable as $fn$
  select coalesce(
    (array_position(array[
      'KR','JP','US','CN',                                  -- 사장님 지정 4개
      'VN','TH','TW','PH','SG','HK','ID','MY',              -- 가까운 아시아
      'FR','IT','ES','GB','DE','CH','CZ','TR',              -- 유럽
      'AU','NZ','CA','MX','PE','AE','EG','IN','NP','MN'     -- 그 외 인기
    ], upper(p_cc)))::int, 999);
$fn$;

create or replace function public.travel_country_cards(p_limit int default 40)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', true, 'countries',
    coalesce(jsonb_agg(x order by rnk, spots desc, code), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'code', p.country_code,
      'name', min(p.country) filter (where p.country is not null),
      'spots', count(*) filter (where p.scale = 'spot'),
      'creators', (select count(distinct ts.channel)
                     from travel_place_sources ts
                     join travel_places p2 on p2.id = ts.place_id
                    where p2.country_code = p.country_code and p2.status = 'live'),
      /* 🚫 영상 썸네일로 떨어지지 않는다 — 나라 카드는 위키보이저 여행 배너만 쓴다. */
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
      p.country_code code,
      travel_country_rank(p.country_code) rnk
    from travel_places p
    where p.status = 'live' and p.country_code is not null
    group by p.country_code
    having count(*) filter (where p.scale = 'spot') > 0
        or travel_country_rank(p.country_code) < 999      -- 고정 순위 나라는 자리를 지킨다
    order by travel_country_rank(p.country_code), count(*) filter (where p.scale='spot') desc
    limit least(coalesce(p_limit, 40), 100)
  ) q;
$fn$;
grant execute on function public.travel_country_rank(text) to anon, authenticated;
