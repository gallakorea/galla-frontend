-- 같은 가게가 두 줄로 들어가는 구멍을 막고, 이미 생긴 4쌍을 합친다.
--
-- 원인 — 중복 방지 유니크 인덱스가 **둘인데 서로 겹치지 않는다**:
--   food_places_dedupe        (norm_name, round(lat,3), round(lon,3))  WHERE 좌표 있음
--   food_places_dedupe_noloc  (norm_name, address)                     WHERE 좌표 없음
--   두 조건이 서로 배타적이라, '좌표 있는 행'과 '좌표 없는 행'은 서로를 못 본다.
--   실측: 호치민포 — 좌표 있는 행과 좌표 없는 행이 같은 주소로 공존.
--   또 좌표가 있어도 네이버가 회차마다 조금 다른 좌표를 주면 round(,3)이 갈린다
--   (백세삼계탕 37.1887 vs 37.1914 → 37.189 / 37.191).
--
-- ⚠️ 실측 4쌍 전부 **정규화한 이름+주소가 같다**. 그 키로 인덱스를 하나 더 걸면 두 구멍이 다 막힌다.
--    live 행 11,846건 중 주소가 빈 행은 0건이라 부분 인덱스가 필요 없다.

/* 두 행을 합친다. 자식 유니크에 걸리는 쪽은 옮기지 않고 버린다(중복이므로 잃는 정보가 없다). */
create or replace function food_merge_place(p_keep uuid, p_drop uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare moved jsonb := '{}'::jsonb; n int;
begin
  if p_keep = p_drop then return jsonb_build_object('ok', false, 'reason', 'same'); end if;

  -- 출처: (place_id, channel, video_id) 유니크
  delete from food_place_sources d
   where d.place_id = p_drop
     and exists (select 1 from food_place_sources k
                  where k.place_id = p_keep and k.channel = d.channel
                    and k.video_id is not distinct from d.video_id);
  update food_place_sources set place_id = p_keep where place_id = p_drop;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('sources', n);

  -- 판정·방문·찜: (user_id, place_id) 유니크
  delete from food_votes d where d.place_id = p_drop
     and exists (select 1 from food_votes k where k.place_id = p_keep and k.user_id = d.user_id);
  update food_votes set place_id = p_keep where place_id = p_drop;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('votes', n);

  delete from food_visits d where d.place_id = p_drop
     and exists (select 1 from food_visits k where k.place_id = p_keep and k.user_id = d.user_id);
  update food_visits set place_id = p_keep where place_id = p_drop;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('visits', n);

  delete from food_saves d where d.place_id = p_drop
     and exists (select 1 from food_saves k where k.place_id = p_keep and k.user_id = d.user_id);
  update food_saves set place_id = p_keep where place_id = p_drop;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('saves', n);

  -- 유니크 없는 자식들은 그대로 옮긴다
  update food_photos       set place_id = p_keep where place_id = p_drop;
  update food_menus        set place_id = p_keep where place_id = p_drop;
  update food_comments     set place_id = p_keep where place_id = p_drop;
  update food_reports      set place_id = p_keep where place_id = p_drop;
  update food_assembly     set place_id = p_keep where place_id = p_drop;
  update food_assembly_rows set place_id = p_keep where place_id = p_drop;

  -- places_tried·food_stats 는 place_id 가 키다
  delete from places_tried where place_id = p_drop
     and exists (select 1 from places_tried k where k.place_id = p_keep);
  update places_tried set place_id = p_keep where place_id = p_drop;

  update food_stats k set good = k.good + d.good, bad = k.bad + d.bad
    from food_stats d where k.place_id = p_keep and d.place_id = p_drop;
  delete from food_stats where place_id = p_drop
     and exists (select 1 from food_stats k where k.place_id = p_keep);
  update food_stats set place_id = p_keep where place_id = p_drop;

  /* 남는 행에 좌표가 없고 버릴 행에 있으면 좌표를 살린다 — 지도에 안 뜨면 없느니만 못하다 */
  update food_places k set lat = d.lat, lon = d.lon
    from food_places d
   where k.id = p_keep and d.id = p_drop and k.lat is null and d.lat is not null;

  delete from food_places where id = p_drop;
  return jsonb_build_object('ok', true, 'moved', moved);
end $$;

revoke all on function food_merge_place(uuid, uuid) from anon, authenticated;
