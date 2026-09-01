-- travel_ingest 에 scale 을 태운다 (2026-09-01)
-- 여행지(나라·도시)와 스팟(POI)이 같은 테이블에 살고, 화면·랭킹은 scale 로 갈린다.
create or replace function public.travel_ingest(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare it jsonb; v_id uuid; v_new int := 0; v_dup int := 0; v_key text;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_id := null;
    v_key := lower(regexp_replace(
               coalesce(nullif(btrim(it->>'name_en'),''), btrim(it->>'name')),
               '[[:space:]]','','g'));
    begin
      insert into travel_places(
        name, name_local, name_en, country_code, country, city, address,
        lat, lon, category, kind, scale, wikidata_qid, osm_ref, geo_source,
        photo, photo_credit, photo_source, origin)
      values (
        btrim(it->>'name'), nullif(btrim(it->>'name_local'),''), nullif(btrim(it->>'name_en'),''),
        upper(nullif(btrim(it->>'country_code'),'')), nullif(btrim(it->>'country'),''),
        nullif(btrim(it->>'city'),''), nullif(btrim(it->>'address'),''),
        nullif(it->>'lat','')::numeric, nullif(it->>'lon','')::numeric,
        nullif(btrim(it->>'category'),''), coalesce(nullif(it->>'kind',''),'spot'),
        coalesce(nullif(it->>'scale',''),'spot'),
        nullif(btrim(it->>'wikidata_qid'),''), nullif(btrim(it->>'osm_ref'),''),
        nullif(btrim(it->>'geo_source'),''),
        nullif(btrim(it->>'photo'),''), nullif(btrim(it->>'photo_credit'),''),
        nullif(btrim(it->>'photo_source'),''),
        coalesce(nullif(it->>'origin',''),'yt'))
      returning id into v_id;
      v_new := v_new + 1;
    exception when unique_violation then
      select id into v_id from travel_places
       where (wikidata_qid is not null and wikidata_qid = nullif(btrim(it->>'wikidata_qid'),''))
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
      /* 사진 없는 행에 사진이 딸려 오면 채운다 — 재방문 수확이 데이터를 개선하게 만든다 */
      if v_id is not null and nullif(btrim(it->>'photo'),'') is not null then
        update travel_places set photo = it->>'photo',
               photo_credit = nullif(btrim(it->>'photo_credit'),''),
               photo_source = nullif(btrim(it->>'photo_source'),''),
               updated_at = now()
         where id = v_id and photo is null;
      end if;
    end;

    if v_id is not null and nullif(it->>'channel','') is not null then
      insert into travel_place_sources(place_id, channel, video_id, video_title, aired_at)
      values (v_id, it->>'channel', nullif(it->>'video_id',''), nullif(it->>'video_title',''),
              nullif(it->>'aired_at','')::timestamptz)
      on conflict do nothing;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'new', v_new, 'dup', v_dup);
end $fn$;
revoke all on function public.travel_ingest(jsonb) from anon, authenticated;
