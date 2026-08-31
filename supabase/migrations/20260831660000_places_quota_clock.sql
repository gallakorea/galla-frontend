-- 유료 API 예산 장부의 하루가 구글의 하루와 16시간 어긋나 있었다.
--
-- 구글 콘솔 할당량은 태평양시 자정(=KST 16시)에 리셋되는데 우리 장부는 KST 자정에
-- 리셋했다. 그래서 KST 00~16시 사이에는 **장부만 새 날**이고 구글은 아직 전날이라,
-- 크론이 예산을 받아 60번을 부르고 60번 다 429를 맞았다.
-- 실측(8/31): 장부 1,055콜 소진, 실제 응답 75건 — 980콜이 429로 증발했다.
--
-- 게다가 예산은 **부르기 전에 선차감**이라 429로 헛돈 몫도 그대로 깎였다.
--   → (1) 장부의 하루를 구글과 같은 시계로 맞춘다
--   → (2) 못 쓴 몫을 돌려받는 환불 경로를 연다(429로 중단할 때 사용)

create or replace function places_take(p_want integer, p_cap integer default 1200)
returns integer language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'America/Los_Angeles')::date; used integer; grant_n integer;
begin
  insert into places_usage(day) values (d) on conflict (day) do nothing;
  select calls into used from places_usage where day = d for update;
  grant_n := greatest(least(coalesce(p_want,0), coalesce(p_cap,1200) - used), 0);
  if grant_n > 0 then
    update places_usage set calls = calls + grant_n, updated_at = now() where day = d;
  end if;
  return grant_n;
end $$;

-- 받아놓고 못 쓴 몫을 오늘 장부로 되돌린다. 음수로 내려가지 않게 막는다.
create or replace function places_refund(p_n integer)
returns integer language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'America/Los_Angeles')::date; left_n integer;
begin
  if coalesce(p_n,0) <= 0 then return 0; end if;
  update places_usage set calls = greatest(calls - p_n, 0), updated_at = now()
   where day = d returning calls into left_n;
  return coalesce(left_n, 0);
end $$;

revoke all on function places_take(integer,integer) from anon, authenticated;
revoke all on function places_refund(integer) from anon, authenticated;
