-- 못 이은 착한가격업소 9,194곳을 가게로 들인다.
--
-- 왜: 이어붙이기 매칭률이 2.1% 밖에 안 나왔다. 우리 가게는 방송·유튜브에 나온 집이라
-- 서울에 6,263곳이 몰려 있고, 착한가격업소는 전국 동네 백반집이라 겹치는 데가 적다.
-- 못 이은 9,194행에는 **메뉴 19,399개**가 그대로 들어 있고, 전라남도는 착한가격 540곳
-- 대 우리 0곳이다. 이어붙이는 것보다 들이는 쪽이 값이 훨씬 크다.
--
-- 필요한 건 좌표뿐이라 네이버 지역검색을 한 건씩 부른다(장부로 막힌다). 나머지 —
-- 상호·주소·메뉴·가격 — 는 이미 정부가 준 값이라 추측이 없다.
--
-- food_ingest 를 안 쓰고 따로 만든 이유: 그쪽은 메뉴 출처를 'yt' 로 박고 id 를 안 돌려준다.
-- 여기서는 출처를 'goodprice' 로 남기고 원본 행에 place_id 를 되꽂아야 한다.
create or replace function food_goodprice_promote(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  r jsonb; pid uuid; it jsonb;
  made int := 0; dup int := 0; menus int := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    pid := null;
    begin
      insert into food_places(name, address, lat, lon, category, phone, origin, good_price)
      values (btrim(r->>'name'), btrim(r->>'address'),
              nullif(r->>'lat','')::numeric, nullif(r->>'lon','')::numeric,
              nullif(r->>'category',''), nullif(r->>'phone',''), 'goodprice', true)
      returning id into pid;
      made := made + 1;
    exception when unique_violation then
      -- 이미 있는 집이었다(다른 이름 표기로 우리 매칭을 빠져나갔던 경우). 메뉴만 얹는다.
      select id into pid from food_places
       where norm_name = lower(regexp_replace(btrim(r->>'name'),'[[:space:]]','','g'))
         and (regexp_replace(coalesce(address,''),'[[:space:]]','','g')
                = regexp_replace(btrim(coalesce(r->>'address','')),'[[:space:]]','','g')
              or (nullif(r->>'lat','') is not null and lat is not null
                  and round(lat,3) = round((r->>'lat')::numeric,3)
                  and round(lon,3) = round((r->>'lon')::numeric,3)))
       limit 1;
      if pid is not null then
        update food_places set good_price = true where id = pid and good_price = false;
      end if;
      dup := dup + 1;
    end;
    if pid is null then continue; end if;

    update food_goodprice set place_id = pid, matched_at = now(), tried_at = now()
     where id = (r->>'gid')::bigint;

    for it in select * from jsonb_array_elements(coalesce(r->'menus', '[]'::jsonb)) loop
      if length(btrim(coalesce(it->>'name',''))) = 0 then continue; end if;
      begin
        insert into food_menus(place_id, name, price, source)
        values (pid, btrim(it->>'name'),
                nullif(regexp_replace(coalesce(it->>'price',''), '[^0-9]', '', 'g'), '')::int,
                'goodprice');
        menus := menus + 1;
      exception when unique_violation then null;
      end;
    end loop;
  end loop;
  return jsonb_build_object('ok', true, 'created', made, 'dup', dup, 'menus', menus);
end $$;

-- 좌표를 물어볼 대상을 고른다. 시도한 것부터 뒤로 미뤄 배치가 앞에서 맴돌지 않게 한다.
create or replace function food_goodprice_todo(p_limit int default 60)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'gid', g.id, 'name', g.name, 'address', g.address,
           'sigun', g.sigun, 'cat', g.cat, 'tel', g.tel, 'menus', g.menus)), '[]'::jsonb)
    from (select * from food_goodprice
           where place_id is null and address is not null and address <> ''
           order by tried_at nulls first, id limit greatest(p_limit, 1)) g;
$$;

-- 물어봤다는 도장. 못 찾은 집을 다음 배치가 또 집으면 한도만 태운다.
create or replace function food_goodprice_touch(p_ids bigint[])
returns integer language sql security definer set search_path to 'public' as $$
  with u as (update food_goodprice set tried_at = now()
              where id = any(coalesce(p_ids, '{}')) returning 1)
  select count(*)::int from u;
$$;

revoke all on function food_goodprice_promote(jsonb) from public, anon, authenticated;
revoke all on function food_goodprice_todo(int)      from public, anon, authenticated;
revoke all on function food_goodprice_touch(bigint[]) from public, anon, authenticated;
grant execute on function food_goodprice_promote(jsonb)  to service_role;
grant execute on function food_goodprice_todo(int)       to service_role;
grant execute on function food_goodprice_touch(bigint[]) to service_role;

-- origin 체크에도 'goodprice' 를 더한다. food_menus.source 때와 같은 자리다 —
-- 새 출처를 만들 때마다 체크 제약 두 곳(origin, source)을 같이 열어야 한다.
alter table food_places drop constraint if exists food_places_origin_check;
alter table food_places add constraint food_places_origin_check
  check (origin in ('yt','user','gov','tour','naver','google','goodprice','baeknyeon','seed'));
