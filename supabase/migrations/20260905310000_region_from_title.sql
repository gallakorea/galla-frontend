-- 🔴 지역은 **제목에서 먼저** 잡는다.
--
-- 설명까지 한 덩어리로 보면 다음 화 예고가 딸려온다:
--   '평택 … 1등 맛집 | 또간집 EP.85' 인데 설명에 '또간집 86화 남대문 시장 편'이 있어
--   region 이 '남대문'으로 박혔다. 서촌 편이 '남양주'로 박힌 것도 같은 이유다.
--   그 잘못된 힌트가 질의를 오염시켜 **남양주 가게 3곳이 또간집에 다녀간 걸로 들어갔다.**
-- 제목은 그 회차 얘기만 한다. 제목에 없을 때만 설명·태그를 본다.
create or replace function public.food_videos_fill_region(p_limit integer default 5000)
returns integer language sql security definer set search_path to 'public' as $$
  with t as (
    select video_id, channel from food_videos
     where region is null and harvested_at is null
     limit greatest(coalesce(p_limit, 5000), 1)),
  m as (
    select t.video_id, t.channel,
           coalesce(
             (select r.name from kr_region_names r
               where coalesce(v.title,'') like '%' || r.name || '%'
               order by length(r.name) desc limit 1),
             (select r.name from kr_region_names r
               where (coalesce(v.description,'') || ' ' || coalesce(v.tags,'')) like '%' || r.name || '%'
               order by length(r.name) desc limit 1)
           ) nm
      from t join food_videos v on v.video_id = t.video_id and v.channel = t.channel),
  u as (
    update food_videos v set region = coalesce(m.nm, '')
      from m where v.video_id = m.video_id and v.channel = m.channel
    returning 1)
  select count(*)::int from u;
$$;
revoke all on function public.food_videos_fill_region(integer) from public, anon;

-- 이미 박힌 것들을 다시 계산한다 — 잘못된 힌트가 그대로 남아 있으면 같은 사고가 반복된다
update food_videos set region = null where harvested_at is null;
