-- 광역(admin1) 보강을 수확 밖으로 뺐으니, 한글화 크론이 '빈 광역'도 맡는다 (2026-09-01)
-- travel_names_to_localize 는 '영문 이름'만 봤다. 이제 **비어 있는 광역**도 대상이다.
create or replace function public.travel_names_to_localize(p_limit int default 30)
returns table(country_code text, raw text, kind text, lat numeric, lon numeric)
language sql stable security definer set search_path to 'public' as $fn$
  with cand as (
    select p.country_code, btrim(p.admin1) raw, 'admin1'::text kind, avg(p.lat) lat, avg(p.lon) lon
      from travel_places p
     where p.status='live' and p.admin1 is not null and p.admin1 !~ '[가-힣]'
     group by 1,2,3
    union all
    select p.country_code, btrim(p.city), 'city', avg(p.lat), avg(p.lon)
      from travel_places p
     where p.status='live' and p.city is not null and p.city !~ '[가-힣]'
     group by 1,2,3
  )
  select c.country_code, c.raw, c.kind, c.lat, c.lon
    from cand c
   where c.country_code is not null and length(c.raw) > 1
     and not exists (select 1 from travel_geo_ko g
                      where g.country_code = c.country_code and g.raw = c.raw)
   limit greatest(coalesce(p_limit, 30), 1);
$fn$;

/* 광역이 아예 비어 있는 장소를 채우는 전용 큐(역지오코딩 zoom=8). */
create or replace function public.travel_places_missing_admin1(p_limit int default 20)
returns table(id uuid, lat numeric, lon numeric)
language sql stable security definer set search_path to 'public' as $fn$
  select p.id, p.lat, p.lon
    from travel_places p
   where p.status='live' and p.admin1 is null and p.lat is not null and p.scale in ('spot','city')
   order by p.created_at desc
   limit greatest(coalesce(p_limit,20),1);
$fn$;

create or replace function public.travel_admin1_save(p_items jsonb)
returns int language plpgsql security definer set search_path = public as $fn$
declare it jsonb; n int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    update travel_places
       set admin1 = nullif(btrim(it->>'admin1'),''), updated_at = now()
     where id = (it->>'id')::uuid and admin1 is null;
    n := n + 1;
  end loop;
  return n;
end $fn$;
revoke all on function public.travel_places_missing_admin1(int) from anon, authenticated;
revoke all on function public.travel_admin1_save(jsonb)         from anon, authenticated;
