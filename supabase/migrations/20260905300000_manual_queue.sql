-- 사람이 보고 넣는 큐. 자동 매칭의 한계선이 확정돼서(2026-09-04) 남은 길은 이것뿐이다.
--
-- ⚠️ 큐를 잘 고르는 게 이 도구의 값 전부다. 사람 시간이 제일 비싸다.
--   · 이미 붙은 영상은 뺀다.
--   · **지역이 잡힌 회차형을 앞으로.** '조롱잔치' 같은 예능 쇼츠는 봐도 건질 게 없다.
--   · 조회수가 아니라 **그 채널이 실제로 가게를 무는 비율**로 줄을 세우는 게 맞지만,
--     그건 이미 harvest 플래그로 갈라놨다. 여기선 회차형·최신순이면 충분하다.
create or replace function public.food_manual_queue(
  p_channel text default null, p_limit integer default 30, p_offset integer default 0)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(x order by score desc, published_at desc nulls last), '[]'::jsonb) from (
    select v.published_at,
           (case when v.title ~ 'EP\.?[0-9]|[0-9]+화|특집' then 3 else 0 end
          + case when v.title ~ '맛집|식당|먹방|투어|털었|가야|추천|골목|노포' then 2 else 0 end
          + case when coalesce(v.region,'') <> '' then 2 else 0 end
          + least(length(coalesce(v.title,'')) / 15, 2)) score,
           jsonb_build_object(
             'video_id', v.video_id, 'title', v.title, 'channel', v.channel,
             'channel_name', c.name, 'published_at', v.published_at, 'region', v.region,
             'description', left(coalesce(v.description,''), 600)) x
      from food_videos v
      join food_channels c on c.slug = v.channel
     where v.harvested_at is null
       and length(coalesce(v.title,'')) >= 6
       and (p_channel is null or v.channel = p_channel)
       and not exists (select 1 from food_place_sources s where s.video_id = v.video_id)
     order by score desc, v.published_at desc nulls last
     limit greatest(coalesce(p_limit, 30), 1) offset greatest(coalesce(p_offset, 0), 0)
  ) q;
$$;

-- 채널 목록 — 남은 게 몇 편인지 보고 고른다
create or replace function public.food_manual_channels()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(x order by 남음 desc), '[]'::jsonb) from (
    select c.slug, c.name, c.kind, c.harvest,
           count(*) filter (where v.harvested_at is null
             and not exists (select 1 from food_place_sources s where s.video_id = v.video_id)) 남음,
           jsonb_build_object('slug', c.slug, 'name', c.name, 'kind', c.kind, 'auto', c.harvest,
             'left', count(*) filter (where v.harvested_at is null
               and not exists (select 1 from food_place_sources s where s.video_id = v.video_id))) x
      from food_channels c join food_videos v on v.channel = c.slug
     where c.active or not c.harvest
     group by c.slug, c.name, c.kind, c.harvest
    having count(*) filter (where v.harvested_at is null
             and not exists (select 1 from food_place_sources s where s.video_id = v.video_id)) > 0
  ) q;
$$;
