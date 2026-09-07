-- 재시도 한 회차 상한을 40 → 120 으로 올린다.
--
-- 국내 pending 4,306곳을 시간당 40건씩 풀면 108시간이 걸린다. 105초 시간 상자가
-- 어차피 안전판이고, 국내는 네이버(70ms sleep)라 120건도 10초면 끝난다.
-- 해외는 OSM(1.1초 sleep)이라 느리지만 그건 시간 상자가 알아서 끊는다.
create or replace function public.travel_pending_to_retry(p_limit integer default 20)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select p.id, p.name, p.name_local, p.name_en, p.city, p.country,
           p.country_code, p.scale, p.kind
      from travel_places p
     where p.status = 'pending'
       and p.geo_tries < 3
       and coalesce(p.name_en, p.name) is not null
     -- 현지 문자(비라틴) 이름이 있는 것부터 — 이번 고침으로 새로 걸릴 확률이 가장 높다
     order by (coalesce(p.name_local,'') <> ''
               and p.name_local !~ '^[A-Za-z0-9[:space:][:punct:]]+$') desc,
              (p.city is not null) desc, p.geo_tries, p.geo_tried_at nulls first
     limit greatest(least(p_limit, 120), 1)
  ) x;
$$;
