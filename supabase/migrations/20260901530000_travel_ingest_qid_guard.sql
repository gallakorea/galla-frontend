-- travel_ingest: 중복 처리 안에서 터지던 예외를 막는다 (2026-09-01)
--
-- 증상: harvest-travel-places 가 통째로 500. "duplicate key ... travel_places_qid".
-- 원인: unique_violation 을 잡은 **예외 블록 안에서** 다시 UPDATE 를 하는데,
--   그 UPDATE 가 `wikidata_qid = coalesce(qid, 새 qid)` 로 남의 QID 를 집으려다 또 걸린다.
--   (같은 곳을 다른 이름으로 두 번 뽑으면 — '카불' / 'Kabul City' — 이름+좌표로는 다른 행인데
--    QID 는 같은 상황이 생긴다.) 예외 안의 예외는 안 잡혀서 함수 전체가 죽는다.
-- 대책 둘:
--   ① QID 는 **아무도 안 쓰고 있을 때만** 채운다.
--   ② 보정 UPDATE 들을 각자 begin/exception 으로 감싼다 — 한 건의 충돌이 회차 전체를 죽이지 않게.
create or replace function public.travel_ingest(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare it jsonb; v_id uuid; v_new int := 0; v_dup int := 0; v_promoted int := 0; v_key text; v_qid text;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_id := null;
    v_qid := nullif(btrim(it->>'wikidata_qid'),'');
    v_key := lower(regexp_replace(
               coalesce(nullif(btrim(it->>'name_en'),''), btrim(it->>'name')),
               '[[:space:]]','','g'));
    begin
      insert into travel_places(
        name, name_local, name_en, country_code, country, admin1, city, address,
        lat, lon, category, kind, scale, wikidata_qid, osm_ref, geo_source,
        photo, photo_credit, photo_source, origin, status)
      values (
        btrim(it->>'name'), nullif(btrim(it->>'name_local'),''), nullif(btrim(it->>'name_en'),''),
        upper(nullif(btrim(it->>'country_code'),'')), nullif(btrim(it->>'country'),''),
        nullif(btrim(it->>'admin1'),''), nullif(btrim(it->>'city'),''), nullif(btrim(it->>'address'),''),
        nullif(it->>'lat','')::numeric, nullif(it->>'lon','')::numeric,
        nullif(btrim(it->>'category'),''), coalesce(nullif(it->>'kind',''),'spot'),
        coalesce(nullif(it->>'scale',''),'spot'),
        v_qid, nullif(btrim(it->>'osm_ref'),''), nullif(btrim(it->>'geo_source'),''),
        nullif(btrim(it->>'photo'),''), nullif(btrim(it->>'photo_credit'),''),
        nullif(btrim(it->>'photo_source'),''),
        coalesce(nullif(it->>'origin',''),'yt'),
        case when it->>'status' = 'pending' then 'pending' else 'live' end)
      returning id into v_id;
      v_new := v_new + 1;
    exception when unique_violation then
      select id into v_id from travel_places
       where (v_qid is not null and wikidata_qid = v_qid)
          or (norm_name = v_key and (
                (nullif(it->>'lat','') is not null and lat is not null
                 and round(lat,3) = round((it->>'lat')::numeric,3)
                 and round(lon,3) = round((it->>'lon')::numeric,3))
             or (lat is null
                 and coalesce(country_code,'') = coalesce(upper(nullif(btrim(it->>'country_code'),'')),'')
                 and coalesce(city,'') = coalesce(nullif(btrim(it->>'city'),''),''))
          ))
       limit 1;
      v_dup := v_dup + 1;

      /* 좌표가 처음 생겼다 → 승격. ⚠️ 각 보정은 따로 감싼다(한 건이 회차를 죽이지 않게). */
      if v_id is not null and nullif(it->>'lat','') is not null then
        begin
          update travel_places set
                 lat = (it->>'lat')::numeric, lon = (it->>'lon')::numeric,
                 geo_source = coalesce(nullif(btrim(it->>'geo_source'),''), geo_source),
                 /* QID 는 아무도 안 쓰고 있을 때만 집는다 — 남의 것을 집으면 유니크에 걸린다 */
                 wikidata_qid = case
                   when wikidata_qid is not null then wikidata_qid
                   when v_qid is null then null
                   when exists (select 1 from travel_places o
                                 where o.wikidata_qid = v_qid and o.id <> travel_places.id) then null
                   else v_qid end,
                 osm_ref = coalesce(osm_ref, nullif(btrim(it->>'osm_ref'),'')),
                 category = coalesce(category, nullif(btrim(it->>'category'),'')),
                 status = 'live', updated_at = now()
           where id = v_id and lat is null;
          get diagnostics v_promoted = row_count;
        exception when others then null;
        end;
      end if;

      if v_id is not null then
        begin
          update travel_places set
                 admin1 = coalesce(admin1, nullif(btrim(it->>'admin1'),'')),
                 city   = coalesce(city,   nullif(btrim(it->>'city'),'')),
                 updated_at = now()
           where id = v_id and (admin1 is null or city is null);
        exception when others then null;
        end;
      end if;

      if v_id is not null and nullif(btrim(it->>'photo'),'') is not null then
        begin
          update travel_places set photo = it->>'photo',
                 photo_credit = nullif(btrim(it->>'photo_credit'),''),
                 photo_source = nullif(btrim(it->>'photo_source'),''),
                 updated_at = now()
           where id = v_id and photo is null;
        exception when others then null;
        end;
      end if;
    end;

    if v_id is not null and nullif(it->>'channel','') is not null then
      begin
        insert into travel_place_sources(place_id, channel, video_id, video_title, aired_at)
        values (v_id, it->>'channel', nullif(it->>'video_id',''), nullif(it->>'video_title',''),
                nullif(it->>'aired_at','')::timestamptz)
        on conflict do nothing;
      exception when others then null;
      end;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'new', v_new, 'dup', v_dup, 'promoted', v_promoted);
end $fn$;
revoke all on function public.travel_ingest(jsonb) from anon, authenticated;
