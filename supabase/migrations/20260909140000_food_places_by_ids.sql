-- 보관(saved.html) 맛집 탭이 항상 비어 있던 것 — QA 0909.
-- food_places 는 RLS 켜짐 + 정책 0개라 PostgREST 직접 조회가 전부 0행이다(의도된 잠금:
-- 목록·상세는 전부 SECURITY DEFINER RPC 로 읽는다). saved.js 만 직접 select 를 해서
-- 찜한 가게가 하나도 안 나왔다. 잠금을 풀지 않고 카드용 컬럼만 주는 RPC 를 만든다.
create or replace function public.food_places_by_ids(p_ids uuid[])
returns table (id uuid, name text, address text, category text, region text, cover_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.address, p.category, p.region, p.cover_url
    from food_places p
   where p.id = any(coalesce(p_ids, '{}'::uuid[]))
   limit 200;
$$;
revoke all on function public.food_places_by_ids(uuid[]) from public;
grant execute on function public.food_places_by_ids(uuid[]) to anon, authenticated, service_role;
