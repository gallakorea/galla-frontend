alter table travel_places add column if not exists places_tried integer default 0;
alter table travel_places add column if not exists places_tried_at timestamptz;
-- 잠긴 테이블에 컬럼만 더하고 grant 를 빠뜨리면 목록이 통째로 42501 로 백지가 된다
grant select (places_tried, places_tried_at) on travel_places to anon, authenticated;

-- 구글 Places 로 여행 장소의 사진·설명을 채운다
--
-- 지금까지: 사진은 위키미디어 커먼즈(4,284)와 한국관광공사(515), 설명은 위키백과(3,831)뿐이었다.
-- 둘 다 '알려진 곳'만 있다. 크리에이터가 다녀온 식당·카페·전망대는 거기 없다.
-- 그래서 사진 9,860곳, 설명 10,828곳이 비었고 크론을 올려도 큐가 비어 있었다 — 천장이었다.
--
-- 구글 Places 는 한 번의 Text Search 로 **사진 + editorialSummary + 좌표**를 같이 준다.
-- 💰 돈이 나가는 API 라 places_take 장부를 반드시 거친다(맛집과 같은 원장).

create or replace function public.travel_places_for_places_api(p_limit integer default 50)
returns jsonb language sql stable security definer set search_path to 'public' as $BODY$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'name_local', p.name_local, 'name_en', p.name_en,
      'city', p.city, 'country', p.country, 'country_code', p.country_code,
      'scale', p.scale, 'lat', p.lat, 'lon', p.lon,
      'need_photo', (p.photo is null or p.photo = ''),
      'need_summary', (p.summary is null or p.summary = '')
    ) x
      from travel_places p
     where p.status = 'live'
       and ((p.photo is null or p.photo = '') or (p.summary is null or p.summary = ''))
       and coalesce(p.places_tried, 0) < 2
     -- 영상이 많이 붙은 곳부터 — 사람이 실제로 보는 화면이 먼저 채워져야 한다
     order by (select count(*) from travel_place_sources s where s.place_id = p.id) desc,
              p.created_at desc
     limit greatest(least(coalesce(p_limit, 50), 200), 1)
  ) q;
$BODY$;

create or replace function public.travel_place_media_set(p_items jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $BODY$
declare it jsonb; n_photo int := 0; n_sum int := 0; n_geo int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
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
      -- 좌표가 없던 곳은 구글이 준 좌표로 채운다(재시도 단계의 덤이다)
      lat = coalesce(lat, nullif(it->>'lat','')::numeric),
      lon = coalesce(lon, nullif(it->>'lon','')::numeric),
      -- 시도 도장 — 안 남기면 못 찾은 곳을 매 회차 다시 사서 부른다(유료 API 다)
      places_tried = coalesce(places_tried, 0) + 1,
      places_tried_at = now(),
      updated_at = now()
     where id = (it->>'id')::uuid;
    if nullif(btrim(it->>'photo'),'') is not null then n_photo := n_photo + 1; end if;
    if nullif(btrim(it->>'summary'),'') is not null then n_sum := n_sum + 1; end if;
    if nullif(it->>'lat','') is not null then n_geo := n_geo + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'photo', n_photo, 'summary', n_sum, 'geo', n_geo);
end $BODY$;

grant execute on function public.travel_places_for_places_api(integer) to service_role;
grant execute on function public.travel_place_media_set(jsonb) to service_role;
