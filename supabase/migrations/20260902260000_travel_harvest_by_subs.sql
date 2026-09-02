-- 수확을 구독자 순 '한 채널씩 끝까지'로 (2026-09-02)
--
-- 사장님: "유튜버별로 해야지, 중구난방식으로 하니 문제인듯."
-- 맞는 지적이다. 큐가 `order by c.last_harvest_at` 이라 **채널을 돌아가며 조금씩** 집었다.
-- 그래서 어느 채널도 완성되지 않고 전부 어중간했다 — 빠니보틀이 372편 중 199편에서
-- 멈춰 있던 것도, 화면 숫자가 계속 애매했던 것도 같은 원인이다.
--
-- → 구독자 많은 채널부터 **남은 영상이 0이 될 때까지 붙잡는다.** 그러면 상위 채널부터
--    차례로 '완성'되고, 화면에 뜨는 사람의 데이터가 먼저 제대로 찬다.
-- ⚠️ 전체 완료 시점은 똑같다. 순서만 바뀐다 — 같은 양을 다른 순서로 처리할 뿐이다.
-- ⚠️ 구독자를 모르는 채널(subs null)은 뒤로 민다. 앞세우면 정체 모를 채널이
--    큐를 통째로 잡고 유명 채널이 굶는다.
-- ⚠️ **한국 채널이 먼저다.** 순수 구독자 순으로 하면 상위 7자리를 영어권이 차지하고
--    (Mark Wiens 1,190만 · Drew Binsky 733만…) 빠니보틀이 7위로 밀린다. 우리 유저가
--    알아보는 건 한국 크리에이터이고, 장소 이름도 한글로 들어온다. travel_browse 의
--    정렬(`(lang is distinct from 'ko'), subs desc`)과도 같은 규칙이라 화면과 큐가 어긋나지 않는다.
--    영어권 10채널 4,744편은 한국 92채널 20,397편 뒤에 붙는다(전체 완료 시점은 동일).
create or replace function public.travel_channel_to_harvest()
returns table(slug text, pending bigint)
language sql stable security definer set search_path = public as $$
  select c.slug, count(v.video_id) as pending
    from travel_channels c
    join travel_videos v on v.channel = c.slug and v.harvested_at is null
   where c.active
   group by c.slug, c.subs, c.lang
  having count(v.video_id) > 0
   order by (c.lang is distinct from 'ko'), c.subs desc nulls last, c.slug
   limit 1;
$$;
