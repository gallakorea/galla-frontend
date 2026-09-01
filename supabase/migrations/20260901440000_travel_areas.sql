-- admin1 을 적재·조회 경로에 태운다 (2026-09-01)

-- ① 적재 — travel_ingest 에 admin1 추가(다른 인자 계약은 그대로)
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

      /* 빈 칸만 채운다 — 이미 있는 값은 회차마다 흔들리게 두지 않는다. */
      if v_id is not null then
        update travel_places set
               admin1 = coalesce(admin1, nullif(btrim(it->>'admin1'),'')),
               city   = coalesce(city,   nullif(btrim(it->>'city'),'')),
               updated_at = now()
         where id = v_id and (admin1 is null or city is null);
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

-- ② 2단계 칩 — 나라 안의 광역. admin1 이 없는 행은 city 로 대신 세운다
--    (해외 소도시는 state 가 비는 경우가 있다. 그때 칩이 통째로 비면 화면이 고장으로 보인다).
create or replace function public.travel_areas(p_country text, p_limit int default 30)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', true, 'areas', coalesce(jsonb_agg(x order by n desc), '[]'::jsonb))
  from (
    select jsonb_build_object('name', area, 'n', count(*)) x, count(*) n
      from (
        select coalesce(nullif(btrim(admin1),''), nullif(btrim(city),'')) area
          from travel_places
         where status = 'live' and country_code = upper(p_country)
      ) q
     where area is not null
     group by area
     order by count(*) desc
     limit least(coalesce(p_limit, 30), 60)
  ) z;
$fn$;

-- ③ 피드에 지역 필터 추가. ⚠️ 인자는 **뒤에** 붙인다(기존 호출부가 안 깨지게).
create or replace function public.travel_feed(p_scale text default null,
                                              p_country text default null,
                                              p_kind text default null,
                                              p_limit int default 30,
                                              p_offset int default 0,
                                              p_area text default null)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with me as (select auth.uid() u)
  select jsonb_build_object('ok', true, 'places', coalesce(jsonb_agg(x order by ord, id_txt), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'name_en', p.name_en,
      'admin1', p.admin1, 'city', p.city,
      'country', p.country, 'country_code', p.country_code,
      'scale', p.scale, 'kind', p.kind, 'category', p.category,
      'lat', p.lat, 'lon', p.lon,
      'cover', travel_cover(p.id), 'photo_credit', p.photo_credit,
      'geo_source', p.geo_source,
      'again', coalesce(s.again,0), 'once', coalesce(s.once,0),
      'want', coalesce(s.want,0), 'pass', coalesce(s.pass,0),
      'mine', (select v.verdict from travel_votes v
                where v.place_id = p.id and v.user_id = (select u from me)),
      'channels', coalesce((select jsonb_agg(distinct c.name)
                             from travel_place_sources ts
                             join travel_channels c on c.slug = ts.channel
                            where ts.place_id = p.id), '[]'::jsonb)) x,
      (case when p.photo is not null then 0 else 1 end) ord,
      p.id::text id_txt
    from travel_places p
    left join travel_stats s on s.place_id = p.id
    where p.status = 'live'
      and (p_scale is null or p.scale = p_scale)
      and (p_country is null or p.country_code = upper(p_country))
      and (p_kind is null or p.kind = p_kind)
      and (p_area is null or coalesce(nullif(btrim(p.admin1),''), nullif(btrim(p.city),'')) = p_area)
    order by (case when p.photo is not null then 0 else 1 end), p.created_at desc
    limit least(coalesce(p_limit, 30), 60) offset greatest(coalesce(p_offset, 0), 0)
  ) q;
$fn$;

grant execute on function public.travel_areas(text,int)                     to anon, authenticated;
grant execute on function public.travel_feed(text,text,text,int,int,text)   to anon, authenticated;
