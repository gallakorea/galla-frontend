-- 안 쓴 몫은 돌려준다.
--
-- naver_take 를 배치 단위로 미리 받는 곳이 둘이다(지자체 수집 todo.length, 수확 영상수×3).
-- 실제로는 그보다 적게 쓴다 — 이미 검증된 가게는 건너뛰고, 영상 한 편에서 후보가 셋 다
-- 나오는 일은 드물다. 안 돌려주면 장부만 차고 진짜 한도는 남는 상태가 된다.
-- (구글 쪽에는 places_refund 로 이미 같은 장치가 있다. 네이버만 빠져 있었다.)
create or replace function naver_refund(p_n integer)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare d date := (now() at time zone 'Asia/Seoul')::date;
begin
  if coalesce(p_n, 0) <= 0 then return 0; end if;
  update naver_usage set calls = greatest(calls - p_n, 0), updated_at = now() where day = d;
  return p_n;
end $$;

revoke all on function naver_refund(integer) from public, anon, authenticated;
grant execute on function naver_refund(integer) to service_role;
