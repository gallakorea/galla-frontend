-- 같은 곳이 여러 행으로 쪼개지는 문제 (2026-09-01)
--
-- 사장님: "빠니 프로필에서 피라미드 보고 들어왔는데, 밑에 다른 사람들 것도 떠야 하는데 안 뜬다."
-- 실제로 기자의 피라미드가 **3행**으로 갈라져 있었다:
--   · 기자의 피라미드 (Q12508)        ← 박엥겍·포테이토 터틀
--   · 멤피스와 네크로폴리스 (Q1175856) ← 소스 없음
--   · 피라미드 (QID 없음)             ← 빠니보틀   ※ 매칭도 틀렸다(5km 밖 오피스 단지)
-- 크리에이터가 한 화면에 모이는 게 이 탭의 값인데, 쪼개지면 그 값이 통째로 사라진다.
--
-- 📐 병합 규칙은 **좁게** 잡는다. 잘못 합치면 서로 다른 두 곳이 영영 한 곳이 되고,
--    되돌릴 근거가 남지 않는다. 그래서 네 조건을 모두 만족할 때만 합친다:
--      ① 같은 나라       ② 흡수되는 쪽에 QID 가 없고 남는 쪽에는 있다
--      ③ 이름이 3자 이상이고 한쪽이 다른 쪽에 통째로 들어간다
--      ④ 50km 이내
--    ②가 핵심이다 — QID 가 있는 행은 위키데이터가 실체를 보증한 행이라 기준으로 삼을 수 있다.
-- ⚠️ 지우기 전에 세어본다. travel_dedupe_scan(dry=true) 이 기본이다.

create or replace function travel_merge_into(p_from uuid, p_to uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a travel_places; b travel_places; moved int := 0; v int := 0; c int := 0; s int := 0;
begin
  if p_from = p_to then return jsonb_build_object('ok', false, 'reason','same'); end if;
  select * into a from travel_places where id = p_from;
  select * into b from travel_places where id = p_to;
  if a.id is null or b.id is null then return jsonb_build_object('ok', false, 'reason','missing'); end if;
  -- 둘 다 QID 가 있는데 서로 다르면 다른 곳이다. 손대지 않는다.
  if a.wikidata_qid is not null and b.wikidata_qid is not null
     and a.wikidata_qid is distinct from b.wikidata_qid then
    return jsonb_build_object('ok', false, 'reason','qid_conflict');
  end if;

  -- 영상 출처: 같은 영상이 두 번 붙지 않게 걸러서 옮긴다
  with mv as (
    update travel_place_sources t set place_id = p_to
     where t.place_id = p_from
       and not exists (select 1 from travel_place_sources x
                        where x.place_id = p_to and x.video_id = t.video_id)
    returning 1)
  select count(*) into moved from mv;
  delete from travel_place_sources where place_id = p_from;   -- 남은 건 중복본

  with mv as (
    update travel_votes t set place_id = p_to where t.place_id = p_from
       and not exists (select 1 from travel_votes x where x.place_id = p_to and x.user_id = t.user_id)
    returning 1) select count(*) into v from mv;
  delete from travel_votes where place_id = p_from;

  with mv as (
    update travel_saves t set place_id = p_to where t.place_id = p_from
       and not exists (select 1 from travel_saves x where x.place_id = p_to and x.user_id = t.user_id)
    returning 1) select count(*) into s from mv;
  delete from travel_saves where place_id = p_from;

  with mv as (update travel_comments set place_id = p_to where place_id = p_from returning 1)
  select count(*) into c from mv;

  -- 남는 쪽의 빈칸을 흡수되는 쪽에서 채운다(있는 정보를 버리지 않는다)
  update travel_places set
    city         = coalesce(city, a.city),
    admin1       = coalesce(admin1, a.admin1),
    address      = coalesce(address, a.address),
    name_local   = coalesce(name_local, a.name_local),
    name_en      = coalesce(name_en, a.name_en),
    category     = coalesce(category, a.category),
    photo        = coalesce(photo, a.photo),
    photo_credit = case when photo is null then a.photo_credit else photo_credit end,
    photo_source = case when photo is null then a.photo_source else photo_source end,
    summary      = coalesce(summary, a.summary),
    summary_src  = coalesce(summary_src, a.summary_src),
    summary_url  = coalesce(summary_url, a.summary_url),
    updated_at   = now()
  where id = p_to;

  delete from travel_places where id = p_from;
  return jsonb_build_object('ok', true, 'from', a.name, 'to', b.name,
                            'videos', moved, 'votes', v, 'saves', s, 'comments', c);
end $$;

revoke all on function travel_merge_into(uuid,uuid) from public, anon, authenticated;

-- 후보를 찾아 (원하면) 합친다. 기본은 미리보기다.
create or replace function travel_dedupe_scan(p_dry boolean default true, p_limit int default 200)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; done int := 0; rep jsonb := '[]'::jsonb; res jsonb;
begin
  for r in
    with p as (
      select id, name, country_code, lat, lon, wikidata_qid,
             (select count(*) from travel_place_sources s where s.place_id = tp.id) src
        from travel_places tp where status = 'live' and lat is not null)
    select distinct on (a.id)
           a.id from_id, a.name from_name, a.src from_src,
           b.id to_id,   b.name to_name,   b.src to_src,
           round(travel_km(a.lat,a.lon,b.lat,b.lon)::numeric,1) km
      from p a
      join p b on a.country_code = b.country_code and a.id <> b.id
             and a.wikidata_qid is null and b.wikidata_qid is not null
             and length(a.name) >= 3 and position(a.name in b.name) > 0
             and travel_km(a.lat,a.lon,b.lat,b.lon) < 50
     -- 후보가 여럿이면 크리에이터가 많이 붙은 쪽, 그다음 가까운 쪽으로 합친다
     order by a.id, b.src desc, travel_km(a.lat,a.lon,b.lat,b.lon)
     limit p_limit
  loop
    if p_dry then
      rep := rep || jsonb_build_object('from', r.from_name, 'from_src', r.from_src,
                                       'to', r.to_name, 'to_src', r.to_src, 'km', r.km);
    else
      res := travel_merge_into(r.from_id, r.to_id);
      rep := rep || res;
      if (res->>'ok')::boolean then done := done + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('dry', p_dry, 'merged', done, 'rows', rep);
end $$;

revoke all on function travel_dedupe_scan(boolean,int) from public, anon, authenticated;
