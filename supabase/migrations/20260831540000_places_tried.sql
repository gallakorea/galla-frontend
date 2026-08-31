-- 구글에 물어봤지만 사진이 없던 곳을 기억한다.
--
-- 🔴 이게 없어서 **돈을 태우고 있었다.** 대상 조회가 '사진 없는 곳'을 created_at 순으로
--    앞에서부터 주는데, 매칭에 실패한 곳은 계속 사진이 없으니 다음 실행에서도
--    똑같이 맨 앞에 온다. 실측: 매칭 12 → 7 → 4 → 2 → 0 으로 무너졌다.
--    같은 20곳을 여섯 번 다시 물어본 것이다(유료 API에서).
--
-- ⚠️ 이 세션에서만 세 번째로 밟은 함정이다(디스커버리 큐, 수집기 큐, 그리고 여기).
--    "실패도 기록해야 큐가 돈다" — 성공했을 때만 도장을 찍으면 큐가 멈춘다.
create table if not exists places_tried (
  place_id   uuid primary key references food_places(id) on delete cascade,
  tried_at   timestamptz not null default now(),
  found      boolean not null default false
);
grant select, insert, update on places_tried to service_role;

-- 사진도 없고 아직 안 물어본 곳만 대상으로 준다.
create or replace function food_places_for_places_api(p_limit integer default 200)
returns table(id uuid, name text, address text, lat numeric, lon numeric)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.address, p.lat, p.lon
    from food_places p
   where p.status='live' and p.lat is not null
     and not exists (select 1 from food_photos ph
                      where ph.place_id=p.id and ph.status='live')
     and not exists (select 1 from places_tried t where t.place_id = p.id)
   order by p.created_at
   limit greatest(coalesce(p_limit,200),1);
$$;
grant execute on function food_places_for_places_api(integer) to service_role;
