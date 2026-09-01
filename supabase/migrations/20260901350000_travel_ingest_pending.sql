-- travel_ingest: 미검증 행(status='pending')을 받고, 나중에 좌표가 오면 승격시킨다 (2026-09-01)
--
-- 왜 pending 을 두나: 검증 관문(OSM·위키데이터)이 못 찾는다고 그 장소가 없는 게 아니다.
--   아프가니스탄·라오스의 식당은 OSM 에 아예 없다. 그런데 '마크 위언스가 카불에서 갔다'는
--   이미 사실이다. 버리면 영원히 안 들어온다 — 맛집이 그렇게 무명 가게를 다 잃었다.
--   지도에는 안 올리고(status='live' 만 올린다) 목록·상세에서만 쓴다.
--
-- ⚠️ 승격은 **좌표가 처음 생길 때만** 한다. 이미 live 인 행의 좌표를 새 값으로 덮으면
--    회차마다 미세하게 다른 좌표로 흔들리고 dedupe 격자가 어긋난다.
create or replace function public.travel_ingest(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare it jsonb; v_id uuid; v_new int := 0; v_dup int := 0; v_promoted int := 0; v_key text;
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
        photo, photo_credit, photo_source, origin, status)
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
        coalesce(nullif(it->>'origin',''),'yt'),
        case when it->>'status' = 'pending' then 'pending' else 'live' end)
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

      /* 좌표가 처음 생겼다 → 승격. 이때 카테고리·출처·사진도 같이 채운다. */
      if v_id is not null and nullif(it->>'lat','') is not null then
        update travel_places set
               lat = (it->>'lat')::numeric, lon = (it->>'lon')::numeric,
               geo_source = coalesce(nullif(btrim(it->>'geo_source'),''), geo_source),
               wikidata_qid = coalesce(wikidata_qid, nullif(btrim(it->>'wikidata_qid'),'')),
               osm_ref = coalesce(osm_ref, nullif(btrim(it->>'osm_ref'),'')),
               category = coalesce(category, nullif(btrim(it->>'category'),'')),
               status = 'live', updated_at = now()
         where id = v_id and lat is null;
        get diagnostics v_promoted = row_count;
      end if;

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
  return jsonb_build_object('ok', true, 'new', v_new, 'dup', v_dup, 'promoted', v_promoted);
end $fn$;
revoke all on function public.travel_ingest(jsonb) from anon, authenticated;
