-- 영상 길이 저장 + 쇼츠 배제 (2026-09-01)
--
-- 곽튜브 최근 300편의 상당수가 쇼츠였다("자동 회전 롤냄비", "아기 미용 도전").
-- 쇼츠엔 장소가 없다 — LLM 을 태워봐야 20편에 4건이 나온다(실측). 수집 단계에서 걸러낸다.
-- 💰 videos.list 는 50개 id 당 1유닛이라 길이 확인 비용이 사실상 0이다.
alter table public.travel_videos add column if not exists duration_s int;
create index if not exists travel_videos_dur on public.travel_videos (channel, duration_s);

/* 수확 큐에서도 쇼츠를 뺀다(이미 들어와 있는 것들). 길이를 모르는 옛 행은 통과시킨다 —
   모르는 걸 버리면 길이 수집 전에 쌓인 영상이 통째로 사라진다. */
create or replace function public.travel_videos_to_harvest(p_channel text, p_limit integer default 20)
returns table(video_id text, title text, description text, published_at timestamptz)
language sql stable security definer set search_path = public as $$
  select v.video_id, v.title, v.description, v.published_at
    from travel_videos v
   where v.channel = p_channel
     and v.harvested_at is null
     and (v.duration_s is null or v.duration_s >= 90)
   order by v.published_at desc nulls last
   limit greatest(coalesce(p_limit, 20), 1);
$$;
revoke all on function public.travel_videos_to_harvest(text,integer) from anon, authenticated;
