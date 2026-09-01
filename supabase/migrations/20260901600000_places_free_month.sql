-- 구글 무료 한도는 **월** 단위인데 우리 상한은 **일** 단위였다.
--
-- 가격표 원문: "서비스 사용량은 월별로 계산됩니다." SKU 별 무료 한도(월):
--   Text Search Enterprise + Atmosphere  1,000   ← 지금 쓰는 등급($40/1,000)
--   Place Details Photos                 1,000
--   Text Search Essentials (IDs Only)    무제한(무료)
--   Place Details Pro                    5,000
--
-- 크론은 하루 900 을 주고 있었다 = 월 27,000. 무료 한도의 **27배**다.
-- 아직 사고는 안 났다(8월 1,056콜 → 56콜 초과 ≈ $2, 9월은 480콜로 한도 안).
-- 이틀만 더 이 속도로 돌면 넘어간다. 그 전에 월 한도를 장부에 박는다.
--
-- 일 상한(p_cap)은 페이스 조절용으로 남긴다. 둘 중 **더 빡빡한 쪽**이 이긴다.
create or replace function places_take(p_want integer, p_cap integer default 1200)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  d date := (now() at time zone 'America/Los_Angeles')::date;
  m date := date_trunc('month', (now() at time zone 'America/Los_Angeles'))::date;
  free_month integer := 1000;          -- 가장 빡빡한 SKU(Text Search Ent+Atmo · Photos)
  used_day integer; used_month integer; grant_n integer;
begin
  insert into places_usage(day) values (d) on conflict (day) do nothing;
  select calls into used_day from places_usage where day = d for update;
  select coalesce(sum(calls), 0) into used_month from places_usage where day >= m;

  grant_n := greatest(least(coalesce(p_want, 0),
                            coalesce(p_cap, 1200) - used_day,
                            free_month - used_month), 0);
  if grant_n > 0 then
    update places_usage set calls = calls + grant_n, updated_at = now() where day = d;
  end if;
  return grant_n;
end $$;

-- 장부의 photos 가 **덮어쓰기**였다(update ... set photos = inserted).
-- calls 는 누적인데 photos 만 마지막 회차 값이라, 어제 650장 받은 날이 21장으로 찍혀 있었다.
-- 한도를 올릴지 판단할 때 보는 숫자가 30분의 1로 보였다. 누적으로 고친다.
create or replace function places_photos_add(p_day date, p_n integer)
returns integer language sql security definer set search_path to 'public' as $$
  update places_usage set photos = coalesce(photos, 0) + greatest(coalesce(p_n, 0), 0),
                          updated_at = now()
   where day = p_day returning photos;
$$;

revoke all on function places_photos_add(date, integer) from public, anon, authenticated;
grant execute on function places_photos_add(date, integer) to service_role;
