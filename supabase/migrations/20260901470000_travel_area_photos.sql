-- 나라·지역 대표 사진 (2026-09-01)
--
-- 사장님: "국가 사진은 그 나라의 가장 아름다운 사진이어야지 유튜브 썸네일이 아니다.
--          도시도 그렇고. 도시에서 들어가면 그때 유튜브 썸네일이 뜨든지."
--
-- 그래서 층마다 사진의 출처를 못 박는다:
--   나라 카드 · 지역 카드 → **위키보이저 여행 배너(P948)**. 유튜브 썸네일 절대 금지.
--   장소 카드            → 장소 실사진 → 없으면 영상 썸네일(허용)
--   누가 갔나            → 그 크리에이터의 영상 썸네일(항상)
--
-- 🖼 P948 을 쓰는 이유: 위키데이터의 P18 은 나라 항목에선 **위성사진·지도**인 경우가 많다
--    (일본=위성사진, 미국=Location Map). P948 은 위키보이저가 '여행 페이지 머리 사진'으로
--    고른 것이라 애초에 아름답게 고른 컷이다 — 일본=등불, 베트남=하롱베이, 도쿄=스카이라인.
--    ⚠️ 배너는 가로로 아주 길다(대략 7:1). 카드도 와이드로 만들어야 크롭이 안 아깝다.
create table if not exists public.travel_area_photos (
  scope      text not null check (scope in ('country','area')),
  code       text not null,          -- country: 'JP' / area: 'JP|도쿄도'
  name       text,
  qid        text,
  photo      text,
  credit     text,
  is_banner  boolean not null default false,
  tried_at   timestamptz not null default now(),
  primary key (scope, code)
);
alter table public.travel_area_photos enable row level security;
drop policy if exists travel_area_photos_read on public.travel_area_photos;
create policy travel_area_photos_read on public.travel_area_photos
  for select to anon, authenticated using (true);
grant select, insert, update, delete on public.travel_area_photos to service_role;

/* 아직 사진을 안 찾아본 나라·지역을 준다. tried_at 은 결과와 무관하게 찍는다 —
   '못 찾았다'와 '안 찾아봤다'를 구분하지 않으면 매 회차 같은 걸 다시 물어본다. */
create or replace function public.travel_areas_needing_photo(p_limit int default 20)
returns table(scope text, code text, name text, country_code text)
language sql stable security definer set search_path to 'public' as $fn$
  (select 'country'::text, p.country_code, min(p.country), p.country_code
     from travel_places p
    where p.status='live' and p.country_code is not null
    group by p.country_code
   having not exists (select 1 from travel_area_photos a
                       where a.scope='country' and a.code = p.country_code))
  union all
  /* ⚠️ having 안에서 바깥 컬럼(admin1)을 참조하면 "ungrouped column" 으로 깨진다.
     그룹핑을 먼저 끝낸 뒤 바깥에서 거른다. */
  (select 'area'::text, g.code, g.name, g.country_code
     from (
       select p.country_code,
              p.country_code || '|' || coalesce(p.admin1, p.city) as code,
              coalesce(p.admin1, p.city) as name
         from travel_places p
        where p.status='live' and p.country_code is not null
          and coalesce(p.admin1, p.city) is not null and p.scale='spot'
        group by p.country_code, coalesce(p.admin1, p.city)
     ) g
    where not exists (select 1 from travel_area_photos a
                       where a.scope='area' and a.code = g.code))
  limit greatest(coalesce(p_limit,20),1);
$fn$;

create or replace function public.travel_area_photo_save(p_items jsonb)
returns int language plpgsql security definer set search_path = public as $fn$
declare it jsonb; n int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    insert into travel_area_photos(scope, code, name, qid, photo, credit, is_banner, tried_at)
    values (it->>'scope', it->>'code', nullif(it->>'name',''), nullif(it->>'qid',''),
            nullif(it->>'photo',''), nullif(it->>'credit',''),
            coalesce((it->>'is_banner')::boolean, false), now())
    on conflict (scope, code) do update
      set name = coalesce(excluded.name, travel_area_photos.name),
          qid = coalesce(excluded.qid, travel_area_photos.qid),
          photo = coalesce(excluded.photo, travel_area_photos.photo),
          credit = coalesce(excluded.credit, travel_area_photos.credit),
          is_banner = excluded.is_banner, tried_at = now();
    n := n + 1;
  end loop;
  return n;
end $fn$;

revoke all on function public.travel_areas_needing_photo(int) from anon, authenticated;
revoke all on function public.travel_area_photo_save(jsonb)  from anon, authenticated;
