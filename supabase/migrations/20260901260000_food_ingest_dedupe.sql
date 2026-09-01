-- food_ingest 의 중복 판정이 새 인덱스를 못 따라간다.
--
-- 지금은 unique_violation 을 잡은 뒤 '이름 + (좌표 3자리 | 주소 완전일치)' 로 기존 행을 찾는다.
-- 그런데 방금 건 인덱스는 '이름 + 공백 제거한 주소' 다. 주소에 공백 차이만 있어도
-- 여기서 못 찾고 v_id 가 null 이 되어 **출처 연결이 통째로 유실된다**(가게는 있는데 누가 갔는지 사라짐).
-- → 찾는 조건에 정규화 주소를 넣는다. 셋 중 하나라도 맞으면 같은 집으로 본다.
create or replace function food_ingest(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare it jsonb; v_id uuid; v_new int := 0; v_dup int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_id := null;
    begin
      insert into food_places(name, address, lat, lon, category, phone, origin)
      values (btrim(it->>'name'), btrim(it->>'address'),
              nullif(it->>'lat','')::numeric, nullif(it->>'lon','')::numeric,
              nullif(it->>'category',''), nullif(it->>'phone',''),
              coalesce(nullif(it->>'origin',''),'yt'))
      returning id into v_id;
      v_new := v_new + 1;
    exception when unique_violation then
      select id into v_id from food_places
       where norm_name = lower(regexp_replace(btrim(it->>'name'),'[[:space:]]','','g'))
         and (
           /* ① 공백 무시한 주소가 같으면 같은 집 — 새 인덱스와 같은 기준 */
           regexp_replace(coalesce(address,''),'[[:space:]]','','g')
             = regexp_replace(btrim(coalesce(it->>'address','')),'[[:space:]]','','g')
           /* ② 좌표가 왔으면 100m 격자로도 본다(네이버가 회차마다 조금씩 다른 좌표를 준다) */
           or (nullif(it->>'lat','') is not null and lat is not null
               and round(lat,3) = round((it->>'lat')::numeric,3)
               and round(lon,3) = round((it->>'lon')::numeric,3))
         )
       limit 1;
      v_dup := v_dup + 1;
    end;
    if v_id is not null and nullif(it->>'channel','') is not null then
      insert into food_place_sources(place_id, channel, video_id, video_title, aired_at)
      values (v_id, it->>'channel', nullif(it->>'video_id',''), nullif(it->>'video_title',''),
              nullif(it->>'aired_at','')::timestamptz)
      on conflict do nothing;
    end if;
  end loop;
  return jsonb_build_object('ok',true,'new',v_new,'dup',v_dup);
end $fn$;
