-- 🍜 통합검색용 맛집 공개 RPC
-- food_places 는 anon 직접 select 가 RLS 로 막혀 0건(맛집 탭은 food_map definer RPC 로 우회).
-- 검색에서도 definer RPC 로 공개 컬럼만, status='live' 만 노출한다.
create or replace function public.food_search_public(p_q text)
returns table(id text, name text, category text, address text, rating numeric, rating_n int)
language sql security definer stable set search_path = public as $$
  select f.id::text, f.name, f.category, f.address, f.rating::numeric, f.rating_n::int
  from public.food_places f
  where f.status = 'live'
    and (f.name ilike '%'||p_q||'%' or f.address ilike '%'||p_q||'%' or f.category ilike '%'||p_q||'%')
  order by f.rating_n desc nulls last
  limit 8
$$;
revoke all on function public.food_search_public(text) from public;
grant execute on function public.food_search_public(text) to anon, authenticated;
