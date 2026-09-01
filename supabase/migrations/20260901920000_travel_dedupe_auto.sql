-- 수확 회차마다 도는 자동 병합 (2026-09-01)
--
-- 중복은 한 번 치우고 끝나는 게 아니다. 수확이 도는 한 계속 생긴다.
-- 그래서 회차 끝에 스스로 치우게 한다 — 단, **사람 눈 없이 지우는 건 가장 안전한 것만**.
--   자동: 이름이 완전히 같고, 한쪽만 QID 가 있고, 50km 이내   ← 판단의 여지가 없다
--   수동: 부분 일치(‘피라미드’⊂‘기자의 피라미드’)는 travel_dedupe_scan 으로 미리 보고 사람이 돌린다
-- ⚠️ 지우는 함수다. 회차당 상한을 둔다 — 규칙이 잘못돼도 한 번에 30행 넘게 못 지운다.
create or replace function travel_dedupe_auto(p_limit int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; done int := 0; names text[] := '{}';
begin
  for r in
    with p as (
      select id, name, norm_name, country_code, lat, lon, wikidata_qid,
             (select count(*) from travel_place_sources s where s.place_id = tp.id) src
        from travel_places tp where status = 'live' and lat is not null)
    select distinct on (a.id) a.id from_id, a.name nm, b.id to_id
      from p a
      join p b on a.country_code = b.country_code and a.id <> b.id
             and a.wikidata_qid is null and b.wikidata_qid is not null
             and length(a.norm_name) >= 3 and a.norm_name = b.norm_name
             and travel_km(a.lat,a.lon,b.lat,b.lon) < 50
     order by a.id, b.src desc, travel_km(a.lat,a.lon,b.lat,b.lon)
     limit greatest(least(p_limit, 30), 0)
  loop
    if (travel_merge_into(r.from_id, r.to_id)->>'ok')::boolean then
      done := done + 1; names := names || r.nm;
    end if;
  end loop;
  return jsonb_build_object('merged', done, 'names', to_jsonb(names[1:10]));
end $$;
revoke all on function travel_dedupe_auto(int) from public, anon, authenticated;
