-- 재시도 큐가 현지 문자 이름을 같이 준다
--
-- 왜: 지오코딩 1차 시도는 영어 이름으로 물었는데, 영어 이름이 대개 로마자 표기다
-- ('Konyoku Rotenburo'·'Kotosankoku'). OSM 에 그런 표기는 없으니 몇 번을 물어도 안 걸린다.
-- 현지 표기로 물으면 걸린다. 그러려면 큐가 name_local 을 줘야 한다.
create or replace function public.travel_pending_to_retry(p_limit integer default 20)
returns jsonb language sql stable security definer set search_path to 'public' as $BODY$
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
     limit greatest(least(p_limit, 40), 1)
  ) x;
$BODY$;

grant execute on function public.travel_pending_to_retry(integer) to service_role;
