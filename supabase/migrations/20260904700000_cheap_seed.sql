-- 🍚 혜자식당 씨앗 — 외부에서 제공받은 저가 식당 목록.
--
-- 구조: 이 목록이 **기본**이고, 우리가 가진 집(메뉴 최저가 8,000원 이하)을 그 위에 얹는다.
-- 다이소·달러샵처럼 이름은 가격 보증이 아니라 카테고리 선언이라 만원 넘지 않는 선까지 담는다.
create table if not exists food_cheap (
  id         bigserial primary key,
  sido       text,
  gu         text,
  name       text not null,
  address    text,
  menu       text,
  price      integer,
  place_id   uuid references food_places(id) on delete set null,
  tried_at   timestamptz,
  tries      int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists food_cheap_uk
  on food_cheap (lower(regexp_replace(name,'[^가-힣a-zA-Z0-9]','','g')), coalesce(address,''));
create index if not exists food_cheap_todo on food_cheap (tried_at nulls first, id)
  where place_id is null;

alter table food_places add column if not exists cheap_seed boolean not null default false;
create index if not exists food_places_cheap_seed on food_places (cheap_seed) where cheap_seed;

create or replace function food_cheap_load(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; n int := 0; d int := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    if length(btrim(coalesce(r->>'name',''))) = 0 then continue; end if;
    begin
      insert into food_cheap(sido, gu, name, address, menu, price)
      values (r->>'sido', r->>'gu', btrim(r->>'name'),
              nullif(btrim(coalesce(r->>'address','')),''),
              nullif(btrim(coalesce(r->>'menu','')),''),
              nullif(r->>'price','')::int);
      n := n + 1;
    exception when unique_violation then d := d + 1;
    end;
  end loop;
  return jsonb_build_object('ok',true,'new',n,'dup',d);
end $$;

-- 좌표를 물어볼 대상(3회 실패하면 접는다 — 착한가격에서 크론이 영원히 헛돌던 그 함정)
create or replace function food_cheap_todo(p_limit int default 100)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'cid', c.id, 'name', c.name, 'sido', c.sido,
           'address', c.address, 'menu', c.menu, 'price', c.price)), '[]'::jsonb)
    from (select * from food_cheap
           where place_id is null and address is not null and tries < 3
           order by tried_at nulls first, id limit greatest(p_limit,1)) c;
$$;

create or replace function food_cheap_touch(p_ids bigint[])
returns integer language sql security definer set search_path to 'public' as $$
  with u as (update food_cheap set tried_at = now(), tries = tries + 1
              where id = any(coalesce(p_ids,'{}')) returning 1)
  select count(*)::int from u;
$$;

create or replace function food_cheap_promote(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; pid uuid; made int := 0; dup int := 0; menus int := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    pid := null;
    begin
      insert into food_places(name, address, lat, lon, origin, cheap_seed)
      values (btrim(r->>'name'), btrim(r->>'address'),
              (r->>'lat')::numeric, (r->>'lon')::numeric, 'cheap', true)
      returning id into pid;
      made := made + 1;
    exception when unique_violation then
      /* 이미 있는 집이면 씨앗 표시만 켠다 — 우리가 이미 아는 집이 목록에도 있는 경우다 */
      select id into pid from food_places
       where norm_name = lower(regexp_replace(btrim(r->>'name'),'[[:space:]]','','g'))
         and (regexp_replace(coalesce(address,''),'[[:space:]]','','g')
                = regexp_replace(btrim(coalesce(r->>'address','')),'[[:space:]]','','g')
              or (lat is not null and round(lat,3) = round((r->>'lat')::numeric,3)
                  and round(lon,3) = round((r->>'lon')::numeric,3)))
       limit 1;
      if pid is not null then
        update food_places set cheap_seed = true where id = pid and cheap_seed = false;
      end if;
      dup := dup + 1;
    end;
    if pid is null then continue; end if;
    update food_cheap set place_id = pid, tried_at = now() where id = (r->>'cid')::bigint;

    if length(coalesce(r->>'menu','')) > 0 and nullif(r->>'price','') is not null then
      begin
        insert into food_menus(place_id, name, price, source)
        values (pid, btrim(r->>'menu'), (r->>'price')::int, 'cheap');
        menus := menus + 1;
      exception when unique_violation then null;
      end;
    end if;
  end loop;
  return jsonb_build_object('ok',true,'created',made,'dup',dup,'menus',menus);
end $$;

alter table food_menus drop constraint if exists food_menus_source_check;
alter table food_menus add constraint food_menus_source_check
  check (source in ('user','yt','goodprice','gov','naver','cheap'));
alter table food_places drop constraint if exists food_places_origin_check;
alter table food_places add constraint food_places_origin_check
  check (origin in ('yt','yt-title','user','gov','tour','naver','google','goodprice','baeknyeon','seed','cheap'));

revoke all on function food_cheap_load(jsonb)     from public, anon, authenticated;
revoke all on function food_cheap_todo(int)       from public, anon, authenticated;
revoke all on function food_cheap_touch(bigint[]) from public, anon, authenticated;
revoke all on function food_cheap_promote(jsonb)  from public, anon, authenticated;
grant execute on function food_cheap_load(jsonb), food_cheap_todo(int),
                          food_cheap_touch(bigint[]), food_cheap_promote(jsonb) to service_role;
