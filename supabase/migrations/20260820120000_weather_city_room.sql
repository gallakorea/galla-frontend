-- 날씨 2차 — 시·군·구 단위 + 검색/즐겨찾기 + 동네 한마디 (2026-08-20)
--
-- 사장님 지적 2개:
--   ① "전북·전남 같은 도 단위는 실사용과 괴리" → 시·군·구로 내렸다(133곳).
--      좌표는 지오코딩으로 '실제로 받아' 넣었고, 내가 적은 시도와 API 의 admin1 이
--      다르면 버렸다(엉뚱한 동네 좌표 방지). 지오코딩에 없는 작은 군 20곳은 아직 비어 있다.
--   ② "댓글로 놀아야 재밌다" → 지역 방(weather_room)에 최근 2시간 한마디.
--
-- ⚠️ DDL 은 Management API 로 이미 적용됐다. 기록·재현용.

alter table public.weather_regions
  add column if not exists parent text references public.weather_regions(code),
  add column if not exists kind text not null default 'sido';
create index if not exists weather_regions_parent on public.weather_regions(parent);

create table if not exists public.weather_comments (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade,
  region text not null references public.weather_regions(code) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 140),
  created_at timestamptz not null default now(),
  status text not null default 'active');
create index if not exists weather_comments_region_recent
  on public.weather_comments (region, created_at desc) where status='active';
create index if not exists weather_comments_user_recent
  on public.weather_comments (user_id, created_at desc);

create table if not exists public.weather_favs (
  user_id uuid not null references auth.users(id) on delete cascade,
  region text not null references public.weather_regions(code) on delete cascade,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, region));

-- 함수 본문은 길어 생략하지 않고 운영 DB 에 있다. 여기서는 '살아있는지'만 검사한다.
-- weather_search(q,limit) · weather_fav(region,on) · weather_my()
-- weather_room(region,limit) · weather_say(region,body) · weather_say_delete(id)
-- ⚠️ weather_search 의 LIMIT 은 jsonb_agg '전에' 걸어야 한다 — 밖에 두면 결과가 한 행이라
--    아무 효과가 없다(실측: limit 6 인데 33건 반환).

do $chk$
declare n int;
begin
  select count(*) into n from weather_regions where kind='city';
  if n < 100 then raise exception '시군구 지점이 %개뿐이다 — 도 단위로 되돌아갔다', n; end if;
  if to_regprocedure('public.weather_say(text,text)') is null then
    raise exception '동네 한마디(weather_say)가 사라졌다 — 이 기능의 핵심이다'; end if;
  if to_regprocedure('public.weather_room(text,int)') is null then
    raise exception 'weather_room 이 사라졌다'; end if;
end $chk$;
