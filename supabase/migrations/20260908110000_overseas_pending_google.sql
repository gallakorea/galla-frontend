-- 해외 pending 을 구글로 연다.
--
-- 왜: 네이버 지역검색은 국내 전용이라 해외 pending 2,888곳은 손이 닿는 수단이 없었다.
-- OSM/위키데이터로는 안 풀려 계속 쌓이기만 했다(어제 2,323 → 오늘 2,888, 오히려 늘었다).
-- 구글은 좌표와 사진을 한 번에 주므로 ₩16 한 번에 둘 다 해결된다.
--
-- ⚠️ 국내는 열지 않는다. 네이버가 공짜로 더 잘 푼다.

-- ① 대상 선정 — live 무사진에 더해 '해외 pending(좌표 없음)'을 받는다.
create or replace function public.travel_places_for_places_api(p_limit integer default 50)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'name_local', p.name_local, 'name_en', p.name_en,
      'city', p.city, 'country', p.country, 'country_code', p.country_code,
      'scale', p.scale, 'lat', p.lat, 'lon', p.lon,
      'need_photo', (p.photo is null or p.photo = ''),
      'need_summary', (p.summary is null or p.summary = '')
    ) x
      from travel_places p
     where coalesce(p.places_tried, 0) < 1          -- 한 번만 산다(2회차는 답이 안 바뀐다)
       and (
         (p.status = 'live'
            and ((p.photo is null or p.photo = '') or (p.summary is null or p.summary = '')))
         or
         /* 해외 pending: 좌표가 없어 지도에 못 올린 곳. 구글이 좌표를 주면 그대로 승격된다.
            국내는 제외한다 — 네이버가 공짜로 더 잘 푼다. */
         (p.status = 'pending' and p.lat is null and coalesce(p.country_code,'') <> 'KR')
       )
     -- 영상이 많이 붙은 곳부터 — 사람이 실제로 보는 화면이 먼저 채워져야 한다
     order by (select count(*) from travel_place_sources s where s.place_id = p.id) desc,
              p.created_at desc
     limit greatest(least(coalesce(p_limit, 50), 200), 1)
  ) q;
$$;

-- ② 저장 — 좌표를 받으면 승격시키고, 중복 충돌은 행 단위로 받는다.
--    어제 travel_pending_resolve 에서 밟은 것과 같은 함정이다: travel_places_dedupe
--    (norm_name, round(lat,3), round(lon,3)) 충돌 한 건이 배치 전체를 롤백시킨다.
create or replace function public.travel_place_media_set(p_items jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  it jsonb; v_id uuid; v_twin uuid;
  n_photo int := 0; n_sum int := 0; n_geo int := 0; n_live int := 0; n_merge int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_id := (it->>'id')::uuid;
    begin
      update travel_places set
        photo        = coalesce(nullif(photo, ''),        nullif(btrim(it->>'photo'), '')),
        photo_credit = case when coalesce(photo,'') = '' and nullif(btrim(it->>'photo'),'') is not null
                            then nullif(btrim(it->>'photo_credit'), '') else photo_credit end,
        photo_source = case when coalesce(photo,'') = '' and nullif(btrim(it->>'photo'),'') is not null
                            then 'google' else photo_source end,
        summary      = coalesce(nullif(summary, ''),      nullif(btrim(it->>'summary'), '')),
        summary_src  = case when coalesce(summary,'') = '' and nullif(btrim(it->>'summary'),'') is not null
                            then 'google' else summary_src end,
        summary_at   = case when coalesce(summary,'') = '' and nullif(btrim(it->>'summary'),'') is not null
                            then now() else summary_at end,
        lat = coalesce(lat, nullif(it->>'lat','')::numeric),
        lon = coalesce(lon, nullif(it->>'lon','')::numeric),
        /* 좌표가 생겼으면 지도에 올릴 수 있다 = live 다. 안 올리면 유료로 받은 좌표를
           쓰지도 못하고 pending 에 그대로 남는다(여는 의미가 없어진다). */
        status = case when status = 'pending'
                       and (lat is not null or nullif(it->>'lat','') is not null)
                      then 'live' else status end,
        places_tried = coalesce(places_tried, 0) + 1,
        places_tried_at = now(),
        updated_at = now()
       where id = v_id;

      if nullif(btrim(it->>'photo'),'')   is not null then n_photo := n_photo + 1; end if;
      if nullif(btrim(it->>'summary'),'') is not null then n_sum   := n_sum   + 1; end if;
      if nullif(it->>'lat','')            is not null then n_geo   := n_geo   + 1; end if;

    exception when unique_violation then
      /* 같은 이름·같은 좌표의 장소가 이미 있다 = 같은 곳이다. 영상만 넘기고 내린다.
         지우지 않는다 — 합치기가 틀렸어도 되돌릴 수 있어야 한다. */
      select t.id into v_twin
        from travel_places t
       where t.norm_name = (select norm_name from travel_places where id = v_id)
         and t.lat is not null and t.lon is not null
         and round(t.lat, 3) = round(nullif(it->>'lat','')::numeric, 3)
         and round(t.lon, 3) = round(nullif(it->>'lon','')::numeric, 3)
         and t.id <> v_id
       limit 1;
      if v_twin is null then
        update travel_places
           set places_tried = coalesce(places_tried,0) + 1, places_tried_at = now()
         where id = v_id;
      else
        update travel_place_sources s set place_id = v_twin
         where s.place_id = v_id
           and not exists (select 1 from travel_place_sources o
                            where o.place_id = v_twin
                              and o.channel  is not distinct from s.channel
                              and o.video_id is not distinct from s.video_id);
        update travel_places
           set status = 'hidden', places_tried = coalesce(places_tried,0) + 1,
               places_tried_at = now(), updated_at = now()
         where id = v_id;
        n_merge := n_merge + 1;
      end if;
    end;
  end loop;
  /* 이번 회차에 실제로 live 가 된 수 */
  select count(*) into n_live from travel_places p
   where p.id in (select (e->>'id')::uuid from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) e)
     and p.status = 'live' and p.places_tried_at > now() - interval '5 minutes';
  return jsonb_build_object('ok', true, 'photo', n_photo, 'summary', n_sum,
                            'geo', n_geo, 'live', n_live, 'merged', n_merge);
end $$;
