-- 맛집 사진(한국관광공사 외부 주소)도 우리 R2 로 이전 대상에 넣는다(26.9.18 사장님).
-- 같은 travel_photo_mirror 대응표·travel-photos-mirror 함수를 쓴다. 되돌리기:
--   update food_photos t set url=m.src from travel_photo_mirror m where m.dst=t.url;
--   update food_places t set cover_url=m.src from travel_photo_mirror m where m.dst=t.cover_url;
create or replace function public.travel_photo_mirror_todo(p_n int)
returns table(src text) language sql security definer set search_path = public as $$
  with ext as (
    select photo as u from travel_places where photo ~ '^https://[^/]*(wikimedia\.org|visitkorea\.or\.kr)/'
    union
    select photo from travel_area_photos where photo ~ '^https://[^/]*(wikimedia\.org|visitkorea\.or\.kr)/'
    union
    select url from food_photos where url ~ '^https://[^/]*(wikimedia\.org|visitkorea\.or\.kr)/'
    union
    select cover_url from food_places where cover_url ~ '^https://[^/]*(wikimedia\.org|visitkorea\.or\.kr)/'
  )
  select e.u from ext e
  left join travel_photo_mirror m on m.src = e.u
  where m.src is null or (m.dst is null and m.tries < 3)
  order by coalesce(m.tries, 0), e.u
  limit greatest(1, least(p_n, 200));
$$;

create or replace function public.travel_photo_mirror_apply(p_src text, p_dst text)
returns int language plpgsql security definer set search_path = public as $$
declare a int; b int; c int; d int;
begin
  insert into travel_photo_mirror(src, dst, updated_at) values (p_src, p_dst, now())
  on conflict (src) do update set dst = excluded.dst, last_err = null, updated_at = now();
  update travel_places set photo = p_dst where photo = p_src; get diagnostics a = row_count;
  update travel_area_photos set photo = p_dst where photo = p_src; get diagnostics b = row_count;
  update food_photos set url = p_dst where url = p_src; get diagnostics c = row_count;
  update food_places set cover_url = p_dst where cover_url = p_src; get diagnostics d = row_count;
  return a + b + c + d;
end $$;
revoke all on function public.travel_photo_mirror_todo(int) from public, anon, authenticated;
revoke all on function public.travel_photo_mirror_apply(text, text) from public, anon, authenticated;
