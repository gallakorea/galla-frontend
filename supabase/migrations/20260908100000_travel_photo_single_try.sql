-- 여행 사진 재시도를 2회 → 1회로 줄인다.
--
-- 실측 2026-09-08: live 무사진 2,542곳 중 1,668곳이 **두 번 물어보고 두 번 다 빈손**이었다.
-- 두 번째 시도는 첫 번째와 같은 이름·같은 좌표로 묻는다. 구글 답이 바뀔 이유가 없는데
-- 값은 똑같이 ₩16 이다 — 여기에만 ₩26,700 을 헛썼다.
-- 이름이나 좌표가 나중에 바뀐 곳은 어차피 그때 다시 후보가 되므로 손해가 없다.
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
     where p.status = 'live'
       and ((p.photo is null or p.photo = '') or (p.summary is null or p.summary = ''))
       and coalesce(p.places_tried, 0) < 1      -- 한 번만 산다
     -- 영상이 많이 붙은 곳부터 — 사람이 실제로 보는 화면이 먼저 채워져야 한다
     order by (select count(*) from travel_place_sources s where s.place_id = p.id) desc,
              p.created_at desc
     limit greatest(least(coalesce(p_limit, 50), 200), 1)
  ) q;
$$;
