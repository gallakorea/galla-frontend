-- 구글 사진 예산을 **사장님이 실제로 보는 집**부터 쓰게 한다.
--
-- 두 가지가 잘못돼 있었다:
--  ① 사진 필터가 없다 — 이미 사진이 있는 집에도 유료 조회를 날린다.
--     어제 관광공사 12,199곳이 들어오면서 그중 8,656곳이 사진을 달고 왔는데,
--     'created_at desc' 라 바로 그 집들이 큐 맨 앞에 섰다. 예산을 통째로 버릴 자리였다.
--  ② 우선순위가 '최근 생성순'이다 — 화면에서 사장님이 보는 건 방송·유튜브(yt)와
--     공직자(gov) 맛집인데, 이건 오래된 데이터라 큐 맨 뒤로 밀린다.
--     실측: yt 25%·gov 17% 커버리지인데 tour 는 71%다. 채워야 할 곳이 뒤에 있었다.
--
-- 순서: yt(방송) → gov(공직자) → goodprice(착한가격) → tour(관광공사)
--   앞 둘이 목록 카드로 노출되는 집이다. tour 는 이미 71% 가 채워져 있어 급하지 않다.
create or replace function food_places_for_places_api(p_limit integer default 200)
returns table(id uuid, name text, address text, lat numeric, lon numeric)
language sql stable security definer set search_path to 'public' as $$
  select p.id, p.name, p.address, p.lat, p.lon
    from food_places p
   where p.status = 'live' and p.lat is not null
     and not exists (select 1 from places_tried t where t.place_id = p.id)
     /* 🔴 이미 사진이 있으면 부르지 않는다 — 유료 호출이다 */
     and not exists (select 1 from food_photos f where f.place_id = p.id and f.status = 'live')
   order by case p.origin when 'yt' then 0 when 'gov' then 1
                          when 'goodprice' then 2 else 3 end,
            p.created_at desc
   limit greatest(coalesce(p_limit, 200), 1);
$$;
