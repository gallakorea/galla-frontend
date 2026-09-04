-- 유튜브 태그를 수확 재료로 쓴다
--
-- 왜: 설명란이 빈 채널이 있다. 서재로36 은 159편 중 145편이 빈칸이고, 제목이
-- 'OECD에서 가장 가난한 나라'처럼 **일부러 나라를 감춘다**(그게 낚시의 핵심이다).
-- 그런 영상은 지금 파이프라인이 손댈 수가 없었다 — 장소가 0곳인 영상이 전체 9,659편이고
-- 마카다TV 1,871편·시수기릿 891편이 같은 상태다.
--
-- 그런데 태그에는 지명이 그대로 있다(실측 2026-09-04, 서재로36 50편 전부 태그 보유):
--   '가장 가난한 나라 부룬디에…'  → ['세계에서 가장 가난한 나라','부룬디','세계여행']
--   '고난의 타지키스탄 가는 길'    → ['타지키스탄','타지키스탄 여행','세계여행']
-- 💰 비용 0: 길이(contentDetails)를 받으려고 이미 부르는 그 호출에 part=snippet 만 더한다.
alter table travel_videos add column if not exists tags text[];
-- ⚠️ 잠긴 테이블에 컬럼만 더하고 grant 를 빠뜨리면 목록이 통째로 42501 로 백지가 된다
grant select (tags) on travel_videos to anon, authenticated;

-- 수확 큐가 태그를 같이 준다
-- ⚠️ 반환 타입이 바뀌므로 drop 이 먼저다(create or replace 로는 못 바꾼다)
drop function if exists public.travel_videos_to_harvest(text, integer);
create function public.travel_videos_to_harvest(p_channel text, p_limit integer default 20)
returns table(video_id text, title text, description text,
              published_at timestamptz, tags text[])
language sql stable security definer set search_path to 'public' as $BODY$
  select v.video_id, v.title, v.description, v.published_at, v.tags
    from travel_videos v
   where v.channel = p_channel
     and v.harvested_at is null
     and (v.duration_s is null or v.duration_s >= 90)
   order by v.published_at desc nulls last
   limit greatest(coalesce(p_limit, 20), 1);
$BODY$;

grant execute on function public.travel_videos_to_harvest(text, integer) to service_role;

-- 태그를 저장하는 자리(백필용). 태그가 없는 영상도 빈 배열로 도장을 남겨야
-- 매 회차 같은 영상을 다시 물어보지 않는다.
create or replace function public.travel_video_tags_set(p_items jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $BODY$
declare it jsonb; n int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    update travel_videos
       set tags = coalesce(
             (select array_agg(x) from jsonb_array_elements_text(it->'tags') x),
             '{}'::text[])
     where video_id = it->>'video_id' and tags is null;
    if found then n := n + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'set', n);
end $BODY$;

grant execute on function public.travel_video_tags_set(jsonb) to service_role;

-- 백필 큐: 태그를 아직 안 받아본 영상
create or replace function public.travel_videos_need_tags(p_limit integer default 200)
returns jsonb language sql stable security definer set search_path to 'public' as $BODY$
  select coalesce(jsonb_agg(v.video_id), '[]'::jsonb) from (
    select video_id from travel_videos
     where tags is null and (duration_s is null or duration_s >= 90)
     order by published_at desc nulls last
     limit greatest(least(coalesce(p_limit,200), 1000), 1)
  ) v;
$BODY$;

grant execute on function public.travel_videos_need_tags(integer) to service_role;
