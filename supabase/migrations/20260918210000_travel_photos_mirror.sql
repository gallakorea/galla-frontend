-- 여행 사진 외부 주소(위키미디어·관광공사) → 우리 R2(cdn.galla.im) 이전(26.9.18).
-- travel_photo_mirror: src(외부) → dst(우리). 되돌리기:
--   update travel_places t set photo=m.src from travel_photo_mirror m where m.dst=t.photo;
--   update travel_area_photos t set photo=m.src from travel_photo_mirror m where m.dst=t.photo;
create table if not exists public.travel_photo_mirror (
  src text primary key,
  dst text,
  tries int not null default 0,
  last_err text,
  updated_at timestamptz not null default now()
);
alter table public.travel_photo_mirror enable row level security;

-- 아직 안 옮긴 외부 주소 n개(실패 3번 넘은 건 제외)
create or replace function public.travel_photo_mirror_todo(p_n int)
returns table(src text) language sql security definer set search_path = public as $$
  with ext as (
    select photo as u from travel_places where photo ~ '^https://[^/]*(wikimedia\.org|visitkorea\.or\.kr)/'
    union
    select photo from travel_area_photos where photo ~ '^https://[^/]*(wikimedia\.org|visitkorea\.or\.kr)/'
  )
  select e.u from ext e
  left join travel_photo_mirror m on m.src = e.u
  where m.src is null or (m.dst is null and m.tries < 3)
  order by coalesce(m.tries, 0), e.u
  limit greatest(1, least(p_n, 200));
$$;

create or replace function public.travel_photo_mirror_apply(p_src text, p_dst text)
returns int language plpgsql security definer set search_path = public as $$
declare a int; b int;
begin
  insert into travel_photo_mirror(src, dst, updated_at) values (p_src, p_dst, now())
  on conflict (src) do update set dst = excluded.dst, last_err = null, updated_at = now();
  update travel_places set photo = p_dst where photo = p_src; get diagnostics a = row_count;
  update travel_area_photos set photo = p_dst where photo = p_src; get diagnostics b = row_count;
  return a + b;
end $$;

create or replace function public.travel_photo_mirror_fail(p_src text, p_err text)
returns void language sql security definer set search_path = public as $$
  insert into travel_photo_mirror(src, tries, last_err) values (p_src, 1, p_err)
  on conflict (src) do update set tries = travel_photo_mirror.tries + 1, last_err = excluded.last_err, updated_at = now();
$$;

revoke all on function public.travel_photo_mirror_todo(int) from public, anon, authenticated;
revoke all on function public.travel_photo_mirror_apply(text, text) from public, anon, authenticated;
revoke all on function public.travel_photo_mirror_fail(text, text) from public, anon, authenticated;
