-- 순차 수확이 첫 채널에서 영원히 갇힐 뻔했다 (2026-09-02)
--
-- 큐를 '구독자 순 한 채널씩 끝까지'로 바꾸자마자 드러난 구멍이다.
--   · travel_channel_to_harvest  : harvested_at is null 이면 전부 '남은 것'으로 셌다
--   · travel_videos_to_harvest   : 90초 미만(쇼츠)은 **건너뛴다**
-- 빠니보틀에 남은 4편이 전부 쇼츠(47~88초)였다. 큐는 "4편 남았다"고 하는데
-- 실제로 집으면 0편 → `picked:0` 만 반복하며 **다음 채널로 영영 못 넘어간다.**
-- 예전 `last_harvest_at` 순서였을 땐 돌아가며 집어서 이 구멍이 안 보였다.
-- 순차로 바꾸면 바로 치명적이 된다 — 순서를 바꾸는 일이 숨은 전제를 드러낸 셈이다.
--
-- 두 함수의 '남은 것' 정의를 같게 맞춘다. 한쪽만 고치면 같은 사고가 다시 난다.
create or replace function public.travel_channel_to_harvest()
returns table(slug text, pending bigint)
language sql stable security definer set search_path = public as $$
  select c.slug, count(v.video_id) as pending
    from travel_channels c
    join travel_videos v
      on v.channel = c.slug
     and v.harvested_at is null
     and (v.duration_s is null or v.duration_s >= 90)   -- ⚠️ travel_videos_to_harvest 와 동일
   where c.active
   group by c.slug, c.subs, c.lang
  having count(v.video_id) > 0
   order by (c.lang is distinct from 'ko'), c.subs desc nulls last, c.slug
   limit 1;
$$;
