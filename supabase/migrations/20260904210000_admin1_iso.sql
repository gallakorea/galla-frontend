-- 지역을 '이름'이 아니라 **ISO 코드**로 잡는다
--
-- 왜: 이름으로 묶으면 같은 곳이 계속 갈라진다(서울 ↔ 서울특별시, 경기 ↔ 경기도).
-- 그리고 Nominatim 은 한국에 state 를 안 주고 city 를 준다 —
-- 거제의 city 는 '거제시'라서, 그걸 광역에 넣으면 경상남도가 시군 단위로 쪼개진다.
-- 실측(2026-09-04): 광역이 빈 장소 2,487곳을 되물었더니 state 는 0건, ISO 는 전부 나왔다.
--   종로경찰서 → KR-11   거제 → KR-48   다낭 → VN-DN   교토 → JP-26
alter table travel_places add column if not exists admin1_iso text;
grant select (admin1_iso) on travel_places to anon, authenticated;
create index if not exists travel_places_admin1_iso_idx on travel_places(country_code, admin1_iso);

-- ISO 코드를 우리 정본 이름으로 옮긴다(국내 17개 시도).
-- 강원·전북은 특별자치도 전환으로 코드가 둘이라 둘 다 넣는다.
insert into travel_region_alias(country_code, raw, canon) values
  ('KR','KR-11','서울'), ('KR','KR-26','부산'), ('KR','KR-27','대구'),
  ('KR','KR-28','인천'), ('KR','KR-29','광주'), ('KR','KR-30','대전'),
  ('KR','KR-31','울산'), ('KR','KR-50','세종'),
  ('KR','KR-41','경기'), ('KR','KR-42','강원'), ('KR','KR-51','강원'),
  ('KR','KR-43','충북'), ('KR','KR-44','충남'),
  ('KR','KR-45','전북'), ('KR','KR-52','전북'),
  ('KR','KR-46','전남'), ('KR','KR-47','경북'), ('KR','KR-48','경남'),
  ('KR','KR-49','제주')
on conflict (country_code, raw) do update set canon = excluded.canon;

-- ISO 와 이름을 같이 받아 저장한다.
-- 이름이 정본 표에 있으면 정본으로, 없으면 받은 이름 그대로.
create or replace function public.travel_admin1_save(p_items jsonb)
returns integer language plpgsql security definer set search_path to 'public' as $BODY$
declare it jsonb; n int := 0; v_iso text; v_name text;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_iso  := nullif(btrim(coalesce(it->>'iso','')), '');
    v_name := nullif(btrim(coalesce(it->>'admin1','')), '');
    update travel_places p
       set admin1_iso = coalesce(p.admin1_iso, v_iso),
           /* ISO 로 아는 이름이 있으면 그게 먼저다 — 'KR-48' 은 '거제시'가 아니라 '경남'이다 */
           admin1 = coalesce(
                      p.admin1,
                      (select canon from travel_region_alias
                        where country_code = p.country_code and raw = v_iso),
                      travel_admin1_canon(p.country_code, v_name)),
           updated_at = now()
     where p.id = (it->>'id')::uuid
       and (p.admin1 is null or p.admin1_iso is null);
    if found then n := n + 1; end if;
  end loop;
  return n;
end $BODY$;

grant execute on function public.travel_admin1_save(jsonb) to service_role;

-- 이미 이름이 있는 장소에도 ISO 를 채우려면 큐가 그것들도 줘야 한다.
create or replace function public.travel_places_missing_admin1(p_limit integer default 20)
returns table(id uuid, lat numeric, lon numeric)
language sql stable security definer set search_path to 'public' as $BODY$
  select p.id, p.lat, p.lon
    from travel_places p
   where p.status = 'live' and p.lat is not null
     and p.scale in ('spot','city')
     and p.admin1 is null            -- 이름부터 채운다(ISO 보강은 나중 일)
   order by p.created_at desc
   limit greatest(coalesce(p_limit, 20), 1);
$BODY$;

grant execute on function public.travel_places_missing_admin1(integer) to service_role;
