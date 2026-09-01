-- 수확할 때 메뉴도 같이 넣는다.
--
-- 메뉴는 어느 공식 API 에도 없다 — 네이버 지역검색에도, 구글 플레이스에도 품목·가격이 없고,
-- 네이버 플레이스 페이지를 긁는 건 안 하기로 한 경로다. 결과가 11,842곳 중 62곳(0.5%)이었다.
-- 반면 크리에이터는 설명에 '한돈 생삼겹 16,000원' 처럼 값을 자주 적는다.
-- 수확이 이미 LLM 을 한 번 부르므로, 거기 얹으면 **추가 비용도 추가 API 호출도 0**이다.
--
-- ⚠️ 네이버 검증을 통과한 가게에만 붙인다(함수 호출부에서 보장). 존재가 확인 안 된 집에
--    메뉴까지 붙으면 거짓말이 두 겹이 된다.
-- ⚠️ 정의는 손으로 옮겨 적지 않고 pg_get_functiondef 원문에 블록만 끼워 넣었다.

CREATE OR REPLACE FUNCTION public.food_ingest(p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    /* 메뉴 — 별도 API 가 없어 영상 설명에서 같이 뽑아온다(harvest-creator-places).
       ⚠️ 값이 적힌 것만 온다. food_menus_uk 가 (place_id, 정규화 메뉴명) 이라 중복은 알아서 막힌다.
       ⚠️ 기존 값을 덮지 않는다 — 유저 제보가 영상 추출보다 정확할 수 있다. */
    if v_id is not null and jsonb_typeof(it->'menus') = 'array' then
      insert into food_menus(place_id, name, price, source)
      select v_id, btrim(m->>'name'), (m->>'price')::integer, 'yt'
        from jsonb_array_elements(it->'menus') m
       where btrim(coalesce(m->>'name','')) <> ''
         and (m->>'price') ~ '^[0-9]+$'
      on conflict do nothing;
    end if;

    if v_id is not null and nullif(it->>'channel','') is not null then
      insert into food_place_sources(place_id, channel, video_id, video_title, aired_at)
      values (v_id, it->>'channel', nullif(it->>'video_id',''), nullif(it->>'video_title',''),
              nullif(it->>'aired_at','')::timestamptz)
      on conflict do nothing;
    end if;
  end loop;
  return jsonb_build_object('ok',true,'new',v_new,'dup',v_dup);
end $function$
;
