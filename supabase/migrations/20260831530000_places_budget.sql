-- 구글 Places 호출 장부 — **돈이 나가는 API**라 우리가 얼마나 불렀는지 스스로 세야 한다.
-- 버그로 루프가 돌면 무료 크레딧($200/월)을 하루에 태울 수 있다. 일일 상한을 DB에 둔다.
create table if not exists places_usage (
  day        date primary key default (now() at time zone 'Asia/Seoul')::date,
  calls      integer not null default 0,
  photos     integer not null default 0,
  updated_at timestamptz not null default now()
);
grant select, insert, update on places_usage to service_role;

-- 오늘 남은 호출 수를 돌려주고, 쓴 만큼 장부에 적는다.
-- p_want 만큼 요청하면 상한 안에서 허용된 만큼만 내준다(0 이면 오늘 끝).
create or replace function places_take(p_want integer, p_cap integer default 1200)
returns integer language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Seoul')::date; used integer; grant_n integer;
begin
  insert into places_usage(day) values (d) on conflict (day) do nothing;
  select calls into used from places_usage where day = d for update;
  grant_n := greatest(least(coalesce(p_want,0), coalesce(p_cap,1200) - used), 0);
  if grant_n > 0 then
    update places_usage set calls = calls + grant_n, updated_at = now() where day = d;
  end if;
  return grant_n;
end $$;
grant execute on function places_take(integer,integer) to service_role;
