-- 한 건의 중복이 배치 전체를 롤백시키고 있었다.
--
-- 실측 2026-09-07: 20곳 중 9곳을 찾았는데 승격은 0이었다. 원인은
--   duplicate key value violates unique constraint "travel_places_dedupe"
--     UNIQUE (norm_name, round(lat,3), round(lon,3)) WHERE lat/lon NOT NULL
-- pending 을 live 로 올리는 순간 **이미 있는 live 쌍둥이**와 부딪힌다. 그런데 이 함수가
-- 통짜 트랜잭션이라 한 행이 터지면 나머지 8곳까지 같이 사라졌다. 게다가 엣지 쪽에서
-- 에러를 삼키고 있어서 '찾았는데 승격 0'이 조용히 반복됐다.
--
-- 고침: 행마다 예외를 받는다. 충돌한 행은 실패가 아니라 **중복**이므로,
--   ① 그 행에 붙은 영상(travel_place_sources)을 쌍둥이로 옮기고
--   ② 행 자체는 지우지 않고 status='hidden' 으로 내린다.
-- 지우지 않는 이유는 되돌릴 수 있어야 해서다 — 합치기가 틀렸어도 원본이 남는다.
create or replace function public.travel_pending_resolve(p_items jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  it jsonb; v_id uuid; v_twin uuid;
  n_live int := 0; n_miss int := 0; n_merge int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_id := (it->>'id')::uuid;

    if nullif(it->>'lat','') is null then
      update travel_places
         set geo_tries = geo_tries + 1, geo_tried_at = now()
       where id = v_id and status = 'pending';
      if found then n_miss := n_miss + 1; end if;
      continue;
    end if;

    begin
      update travel_places set
             lat = (it->>'lat')::numeric,
             lon = (it->>'lon')::numeric,
             status = 'live',
             geo_source = coalesce(nullif(btrim(it->>'geo_source'),''), geo_source),
             wikidata_qid = case
               when wikidata_qid is not null then wikidata_qid
               when nullif(btrim(it->>'wikidata_qid'),'') is null then null
               /* 남의 QID 를 집으면 유니크에 걸려 이 행만 조용히 실패한다 */
               when exists (select 1 from travel_places o
                             where o.wikidata_qid = nullif(btrim(it->>'wikidata_qid'),'')
                               and o.id <> travel_places.id) then null
               else nullif(btrim(it->>'wikidata_qid'),'') end,
             admin1 = coalesce(admin1, travel_admin1_canon(country_code, nullif(btrim(it->>'admin1'),''))),
             city   = coalesce(city,   nullif(btrim(it->>'city'),'')),
             photo  = coalesce(photo,  nullif(btrim(it->>'photo'),'')),
             photo_credit = coalesce(photo_credit, nullif(btrim(it->>'photo_credit'),'')),
             photo_source = coalesce(photo_source, nullif(btrim(it->>'photo_source'),'')),
             geo_tries = geo_tries + 1, geo_tried_at = now(), updated_at = now()
       where id = v_id and status = 'pending';
      if found then n_live := n_live + 1; end if;

    exception when unique_violation then
      /* 같은 이름·같은 좌표의 live 가 이미 있다 = 같은 장소다. 영상만 넘기고 내린다. */
      select t.id into v_twin
        from travel_places t
       where t.norm_name = (select norm_name from travel_places where id = v_id)
         and t.lat is not null and t.lon is not null
         and round(t.lat, 3) = round((it->>'lat')::numeric, 3)
         and round(t.lon, 3) = round((it->>'lon')::numeric, 3)
         and t.id <> v_id
       limit 1;

      if v_twin is null then
        update travel_places set geo_tries = geo_tries + 1, geo_tried_at = now() where id = v_id;
        n_miss := n_miss + 1;
      else
        /* 쌍둥이에 이미 같은 (채널,영상)이 있으면 옮기지 않는다 — travel_sources_uk 재충돌 방지 */
        update travel_place_sources s set place_id = v_twin
         where s.place_id = v_id
           and not exists (select 1 from travel_place_sources o
                            where o.place_id = v_twin
                              and o.channel is not distinct from s.channel
                              and o.video_id is not distinct from s.video_id);
        update travel_places
           set status = 'hidden', geo_tries = geo_tries + 1, geo_tried_at = now(), updated_at = now()
         where id = v_id;
        n_merge := n_merge + 1;
      end if;
    end;
  end loop;
  return jsonb_build_object('ok', true, 'live', n_live, 'miss', n_miss, 'merged', n_merge);
end $$;
