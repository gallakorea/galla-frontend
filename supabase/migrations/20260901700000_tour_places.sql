-- 관광공사 음식점 13,499곳을 **가게로** 들인다.
--
-- 지금까지는 이 데이터를 '사진 붙이기'에만 썼다 — 우리 가게와 이름·좌표로 맞춰서
-- 1,287곳(11%)만 건졌다. 나머지 12,000곳은 그냥 버렸다.
-- 그런데 이 데이터에는 **상호·주소·좌표·대표사진이 다 들어 있다.** 매칭할 게 아니라
-- 들이면 사진 달린 가게가 공짜로 12,000곳 늘어난다. 구글·네이버 호출 0.
--
-- ⚖️ 공공누리: cpyrhtDivCd 가 Type1/Type3 인 것만 쓴다(둘 다 상업적 이용 가능).
--    유형이 비면 권리관계가 불분명하니 사진은 안 쓰고 가게만 들인다.
--    이미지는 복제하지 않고 관광공사 CDN URL 을 참조한다. 출처는 credit 에 남긴다.
create or replace function food_tour_promote(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  r jsonb; pid uuid;
  made int := 0; dup int := 0; pics int := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if length(btrim(coalesce(r->>'name',''))) = 0 then continue; end if;
    if nullif(r->>'lat','') is null or nullif(r->>'lon','') is null then continue; end if;
    pid := null;
    begin
      insert into food_places(name, address, lat, lon, category, origin)
      values (btrim(r->>'name'), nullif(btrim(coalesce(r->>'address','')), ''),
              (r->>'lat')::numeric, (r->>'lon')::numeric,
              nullif(r->>'category',''), 'tour')
      returning id into pid;
      made := made + 1;
    exception when unique_violation then
      select id into pid from food_places
       where norm_name = lower(regexp_replace(btrim(r->>'name'),'[[:space:]]','','g'))
         and (regexp_replace(coalesce(address,''),'[[:space:]]','','g')
                = regexp_replace(btrim(coalesce(r->>'address','')),'[[:space:]]','','g')
              or (lat is not null and round(lat,3) = round((r->>'lat')::numeric,3)
                  and round(lon,3) = round((r->>'lon')::numeric,3)))
       limit 1;
      dup := dup + 1;
    end;
    if pid is null then continue; end if;

    /* 사진 — 이미 있는 집은 건드리지 않는다(유저 사진이 기계 것보다 낫다) */
    if length(coalesce(r->>'image','')) > 0
       and not exists (select 1 from food_photos f where f.place_id = pid and f.status = 'live') then
      begin
        insert into food_photos(place_id, url, source, credit, status)
        values (pid, r->>'image', 'tour', '한국관광공사', 'live');
        pics := pics + 1;
      exception when unique_violation then null;
      end;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'created', made, 'dup', dup, 'photos', pics);
end $$;

revoke all on function food_tour_promote(jsonb) from public, anon, authenticated;
grant execute on function food_tour_promote(jsonb) to service_role;
