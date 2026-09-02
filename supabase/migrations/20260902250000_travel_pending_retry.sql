-- 좌표 못 찾은 곳을 다시 찾아본다 (2026-09-02)
--
-- 사장님: "pending 27곳도 좌표 다시 찾아봐."
-- 지금까지 **재시도 경로가 아예 없었다.** 수확 회차에서 한 번 못 찾으면 status='pending' 으로
-- 굳고 끝이었다. 2,080곳이 그렇게 쌓였는데, 그중엔 '사해(Dead Sea)' 처럼 명백히 찾을 수 있는
-- 곳도 섞여 있다 — 그때 지오코딩이 삐끗했거나 한도에 걸렸을 뿐이다.
--
-- ⚠️ 무한 재시도는 금물이다. '인도 이발소'·'우르벡스 투어'처럼 애초에 장소가 아닌 이름이
--    3할쯤 된다. 시도 횟수를 세서 3번 실패하면 그만 묻는다 — 안 그러면 그 이름들이
--    매 회차 큐 앞을 차지하고 Nominatim 몫을 영원히 먹는다(맛집에서 겪은 굶주림과 같은 자리).

alter table travel_places
  add column if not exists geo_tries int not null default 0,
  add column if not exists geo_tried_at timestamptz;

create index if not exists travel_places_pending_retry_idx
  on travel_places (geo_tries, geo_tried_at nulls first)
  where status = 'pending';

/* 재시도 대상. 아직 안 물어본 것 → 오래된 것 순.
   이름만 있고 나라도 도시도 없는 건 물어봐야 답이 없으니 뒤로 민다. */
create or replace function travel_pending_to_retry(p_limit int default 20)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select p.id, p.name, p.name_en, p.city, p.country, p.country_code, p.scale, p.kind
      from travel_places p
     where p.status = 'pending'
       and p.geo_tries < 3
       and coalesce(p.name_en, p.name) is not null
     order by (p.city is not null) desc, p.geo_tries, p.geo_tried_at nulls first
     limit greatest(least(p_limit, 40), 1)
  ) x;
$$;

/* 결과 반영. 찾았으면 살리고, 못 찾았으면 **횟수만 올린다**
   — '물어봤다'를 남기지 않으면 같은 이름을 영원히 다시 묻는다. */
create or replace function travel_pending_resolve(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
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
             admin1 = coalesce(admin1, nullif(btrim(it->>'admin1'),'')),
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
end $$;

revoke all on function travel_pending_to_retry(int) from public, anon, authenticated;
revoke all on function travel_pending_resolve(jsonb) from public, anon, authenticated;
