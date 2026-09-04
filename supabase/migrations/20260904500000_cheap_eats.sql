-- 🍚 혜자식당 — 만원 넘지 않는 집. 값이 곧 기준이다.
--
-- '착한가격'은 정부가 실사해서 지정한 집이고, 이건 **값 자체**가 기준이다. 축이 다르다.
-- 기준 8,000원 이하 = 천 단위로 먹는 집. 우리 데이터로 6,172곳 — 남의 목록(2,501)의 2.5배다.
--
-- ⚠️ 해외 통화가 원화처럼 섞여 있다. 베이징 '작장면 38원'은 38위안(약 7,400원)이고
--    방콕 '코코넛 아이스크림 60원'은 60바트다. 그대로 두면 혜자식당에 베이징 집이 뜬다.
--    → 한반도 안(lat 33~39.5 / lon 124~132)만 센다.
-- ⚠️ 이름이 약속을 한다. 목록은 **싼 순**으로 내고 카드에 최저가를 띄운다 —
--    첫 화면이 '김밥 2,500원'부터 시작하면 8,000원짜리가 뒤에 있어도 속았다는 말이 안 나온다.

alter table food_places add column if not exists min_price integer;

-- 메뉴가 바뀌면 최저가를 다시 계산한다. 필터를 매번 집계하면 3만 곳에서 느리다.
create or replace function food_places_sync_min_price(p_id uuid)
returns void language sql security definer set search_path to 'public' as $$
  update food_places p
     set min_price = (select min(m.price) from food_menus m
                       where m.place_id = p.id and m.price is not null and m.price > 0)
   where p.id = p_id;
$$;

create or replace function food_menus_aiud() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  perform food_places_sync_min_price(coalesce(new.place_id, old.place_id));
  return null;
end $$;

drop trigger if exists food_menus_price_sync on food_menus;
create trigger food_menus_price_sync
  after insert or update of price or delete on food_menus
  for each row execute function food_menus_aiud();

-- 기존 데이터 채우기
update food_places p
   set min_price = t.mn
  from (select place_id, min(price) mn from food_menus
         where price is not null and price > 0 group by place_id) t
 where t.place_id = p.id;

create index if not exists food_places_min_price
  on food_places (min_price) where min_price is not null;
