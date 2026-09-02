-- travel_ingest 가 장소별 한 줄(note)을 같이 저장한다 (2026-09-02)
-- ⚠️ 원본 정의를 pg_get_functiondef 로 그대로 떠서 insert 한 곳만 고쳤다.
CREATE OR REPLACE FUNCTION public.travel_ingest(p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare it jsonb; v_id uuid; v_new int := 0; v_dup int := 0; v_promoted int := 0;
        v_key text; v_qid text; v_lat numeric; v_lon numeric; v_cc text; v_reused int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_id := null;
    v_qid := nullif(btrim(it->>'wikidata_qid'),'');
    v_key := lower(regexp_replace(
               coalesce(nullif(btrim(it->>'name_en'),''), btrim(it->>'name')),
               '[[:space:]]','','g'));
    v_lat := nullif(it->>'lat','')::numeric;
    v_lon := nullif(it->>'lon','')::numeric;
    v_cc  := upper(nullif(btrim(it->>'country_code'),''));

    /* ① 이미 있는 곳인가 — QID 가 제일 확실하고, 없으면 이름+거리로 본다 */
    if v_qid is not null then
      select id into v_id from travel_places where wikidata_qid = v_qid limit 1;
    end if;
    if v_id is null and v_lat is not null and v_cc is not null and length(v_key) >= 3 then
      select id into v_id from travel_places
       where status = 'live' and lat is not null and country_code = v_cc
         and abs(lat - v_lat) < 0.5 and abs(lon - v_lon) < 0.5      -- 인덱스용 사전 컷
         and length(norm_name) >= 3
         and (norm_name = v_key
              or position(v_key in norm_name) > 0
              or position(norm_name in v_key) > 0)
         and travel_km(lat, lon, v_lat, v_lon)
             < case when norm_name = v_key then 50 else 10 end
       order by (norm_name = v_key) desc, travel_km(lat, lon, v_lat, v_lon)
       limit 1;
      if v_id is not null then v_reused := v_reused + 1; end if;
    end if;

    if v_id is null then
      begin
        insert into travel_places(
          name, name_local, name_en, country_code, country, admin1, city, address,
          lat, lon, category, kind, scale, wikidata_qid, osm_ref, geo_source,
          photo, photo_credit, photo_source, origin, status)
        values (
          btrim(it->>'name'), nullif(btrim(it->>'name_local'),''), nullif(btrim(it->>'name_en'),''),
          v_cc, nullif(btrim(it->>'country'),''),
          nullif(btrim(it->>'admin1'),''), nullif(btrim(it->>'city'),''), nullif(btrim(it->>'address'),''),
          v_lat, v_lon,
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
                  (v_lat is not null and lat is not null
                   and round(lat,3) = round(v_lat,3) and round(lon,3) = round(v_lon,3))
               or (lat is null
                   and coalesce(country_code,'') = coalesce(v_cc,'')
                   and coalesce(city,'') = coalesce(nullif(btrim(it->>'city'),''),''))
            ))
         limit 1;
        v_dup := v_dup + 1;
      end;
    else
      v_dup := v_dup + 1;
    end if;

    /* ② 기존 행 보정. ⚠️ 각각 따로 감싼다 — 한 건의 충돌이 회차를 죽이지 않게. */
    if v_id is not null and v_lat is not null then
      begin
        update travel_places set
               lat = v_lat, lon = v_lon,
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

      /* 재사용한 행이라도 QID 가 비어 있으면 채운다 — 다음부터 이 행이 기준점이 된다 */
      if v_qid is not null then
        begin
          update travel_places set wikidata_qid = v_qid, updated_at = now()
           where id = v_id and wikidata_qid is null
             and not exists (select 1 from travel_places o where o.wikidata_qid = v_qid);
        exception when others then null;
        end;
      end if;
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

    if v_id is not null and nullif(it->>'channel','') is not null then
      begin
        insert into travel_place_sources(place_id, channel, video_id, video_title, aired_at, note)
        values (v_id, it->>'channel', nullif(it->>'video_id',''), nullif(it->>'video_title',''),
                nullif(it->>'aired_at','')::timestamptz,
                /* 장소별 한 줄 — 없으면 나중에 백필이 채운다 */
                nullif(btrim(it->>'note'),''))
        on conflict do nothing;
      exception when others then null;
      end;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'new', v_new, 'dup', v_dup,
                            'reused', v_reused, 'promoted', v_promoted);
end $function$
;
