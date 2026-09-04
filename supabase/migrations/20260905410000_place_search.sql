-- 퀴즈 답 고르기 ①: 우리가 이미 가진 가게에서 찾는다(37,000곳). 외부 호출이 없어 공짜고 빠르다.
-- 없을 때만 ②네이버로 넘어간다.
create index if not exists food_places_name_trgm on food_places using gin (name gin_trgm_ops);
create or replace function public.food_place_search(p_q text, p_limit integer default 8)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'name', name, 'address', address, 'category', category) order by sim desc), '[]'::jsonb)
    from (
      select id, name, address, category, similarity(name, btrim(p_q)) sim
        from food_places
       where status = 'live'
         and btrim(coalesce(p_q,'')) <> ''
         and (name ilike '%' || btrim(p_q) || '%' or name % btrim(p_q))
       order by similarity(name, btrim(p_q)) desc
       limit greatest(coalesce(p_limit, 8), 1)
    ) q;
$$;
grant execute on function public.food_place_search(text, integer) to authenticated, anon;

-- 퀴즈 답 고르기 ②: 네이버가 확인해준 새 가게를 넣고 id 를 돌려준다(엣지 함수가 부른다).
-- ⚠️ 여기서는 출처를 안 만든다. '누가 갔나'는 두 사람이 합의해야 붙는다(submit_food_quiz).
create or replace function public.food_place_ensure(
  p_name text, p_address text, p_lat numeric default null, p_lon numeric default null,
  p_category text default null, p_phone text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  select id into v_id from food_places
   where norm_name = lower(regexp_replace(btrim(p_name),'[[:space:]]','','g'))
     and regexp_replace(coalesce(address,''),'[[:space:]]','','g')
       = regexp_replace(btrim(coalesce(p_address,'')),'[[:space:]]','','g')
   limit 1;
  if v_id is not null then return v_id; end if;
  insert into food_places(name, address, lat, lon, category, phone, origin)
  values (btrim(p_name), btrim(p_address), p_lat, p_lon,
          nullif(btrim(coalesce(p_category,'')),''), nullif(btrim(coalesce(p_phone,'')),''), 'quiz')
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select id into v_id from food_places
   where norm_name = lower(regexp_replace(btrim(p_name),'[[:space:]]','','g'))
   order by created_at limit 1;
  return v_id;
end $$;
revoke all on function public.food_place_ensure(text,text,numeric,numeric,text,text) from public, anon, authenticated;

-- origin 체크에 quiz 를 넣는다 — 새 출처는 두 체크를 다 넓혀야 한다(이 프로젝트에서 두 번 밟았다)
do $$ begin
  alter table food_places drop constraint if exists food_places_origin_check;
  alter table food_places add constraint food_places_origin_check
    check (origin in ('yt','tv','guide','gov','user','tour','goodprice','cheap','quiz','naver','manual'));
exception when others then null; end $$;
