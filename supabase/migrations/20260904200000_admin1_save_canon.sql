-- 새로 들어오는 광역도 정본으로 저장한다
--
-- 표만 만들어 두고 쓰기 경로를 안 막으면, 다음 수확부터 다시 '경기도'와 '경기'가
-- 나란히 쌓인다. 정리는 한 번으로 끝나야 한다.
create or replace function public.travel_admin1_save(p_items jsonb)
returns integer language plpgsql security definer set search_path to 'public' as $BODY$
declare it jsonb; n int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    update travel_places p
       set admin1 = travel_admin1_canon(p.country_code, nullif(btrim(it->>'admin1'),'')),
           updated_at = now()
     where p.id = (it->>'id')::uuid and p.admin1 is null;
    n := n + 1;
  end loop;
  return n;
end $BODY$;

grant execute on function public.travel_admin1_save(jsonb) to service_role;

-- 좌표 재시도 경로도 같은 규칙을 쓴다(여기서만 빠지면 그 길로 옛 표기가 다시 들어온다)
CREATE OR REPLACE FUNCTION public.travel_pending_resolve(p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare it jsonb; n_live int := 0; n_miss int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if nullif(it->>'lat','') is not null then
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
       where id = (it->>'id')::uuid and status = 'pending';
      if found then n_live := n_live + 1; end if;
    else
      update travel_places
         set geo_tries = geo_tries + 1, geo_tried_at = now()
       where id = (it->>'id')::uuid and status = 'pending';
      if found then n_miss := n_miss + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'live', n_live, 'miss', n_miss);
end $function$
;
