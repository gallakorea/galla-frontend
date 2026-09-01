-- 네이버 지역검색 호출 장부. 429 를 맞고서야 멈추는 게 아니라, 그 전에 스스로 선다.
--
-- 오늘 사고: 크론 3개 + 백그라운드 루프 2개가 같은 API 를 동시에 때려 하루치를 다 태웠다.
--   네이버 응답과 콘솔이 같은 숫자를 찍었다 — {count/quota=25000/25000}.
--   예산 관리 없이 최대 속도로 민 게 원인이다.
--
-- 구글 사진 수집에 쓰는 places_take/places_refund 와 같은 구조다(오늘 그걸로 폭주를 막았다).
-- ⚠️ 하루 경계는 KST 다 — 네이버 한도는 한국시간 자정에 리셋된다.
--    구글(태평양시)과 다르므로 같은 함수를 재사용하지 않고 따로 둔다. 오늘 그 시차로 한 번 데였다.
-- ⚠️ 상한을 25,000 이 아니라 20,000 으로 잡는다. 같은 키를 쓰는 다른 기능(검색 등)이 있고,
--    꽉 채우면 그쪽이 죽는다. 여유를 남기는 게 장부의 목적이다.

create table if not exists naver_usage (
  day date primary key,
  calls integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table naver_usage enable row level security;

/* 쓸 만큼 미리 받아간다. 남은 게 없으면 0 — 호출부는 아예 부르지 않는다. */
create or replace function naver_take(p_want integer, p_cap integer default 20000)
returns integer language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Seoul')::date; used integer; grant_n integer;
begin
  insert into naver_usage(day) values (d) on conflict (day) do nothing;
  select calls into used from naver_usage where day = d for update;
  grant_n := greatest(least(coalesce(p_want,0), coalesce(p_cap,20000) - used), 0);
  if grant_n > 0 then
    update naver_usage set calls = calls + grant_n, updated_at = now() where day = d;
  end if;
  return grant_n;
end $$;

/* 받아놓고 못 쓴 몫을 돌려준다(429 로 일찍 멈췄을 때). */
create or replace function naver_refund(p_n integer)
returns integer language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Seoul')::date; left_n integer;
begin
  if coalesce(p_n,0) <= 0 then return 0; end if;
  update naver_usage set calls = greatest(calls - p_n, 0), updated_at = now()
   where day = d returning calls into left_n;
  return coalesce(left_n, 0);
end $$;

revoke all on function naver_take(integer,integer) from anon, authenticated;
revoke all on function naver_refund(integer) from anon, authenticated;

-- 오늘 몫은 이미 소진됐다. 장부에도 사실대로 적어둔다 — 자정에 새 행이 열린다.
insert into naver_usage(day, calls) values ((now() at time zone 'Asia/Seoul')::date, 20000)
on conflict (day) do update set calls = greatest(naver_usage.calls, 20000);
