-- 🔴 오버로드가 번역·태그 작업을 통째로 사장시켰다.
--
-- food_videos_to_harvest_title 이 두 개였다:
--   (integer)        ← 번역·태그를 넣어둔 것. **아무도 안 부른다.**
--   (integer, text)  ← harvest-creator-places 가 실제로 부르는 것. 설명 원문 1200자만.
-- 채널별 분리('여행처럼 채널씩 뽀개')로 2-인자를 만들 때 1-인자를 지우지 않아 생긴 일이다.
-- 그 뒤 번역 12,819편·태그 7,247편을 모아 1-인자에만 붙였으니 수확에는 한 글자도 안 갔다.
-- 게다가 둘 다 남아 있으면 인자 하나로 부를 때 PostgREST 가 고르지 못해 42725 로 죽는다.
--
-- → 하나로 합친다. 앞으로 이 함수는 **하나만** 존재한다.
--   (food_map 에서 겪은 것과 같은 함정: 인자 이름이 겹치는 오버로드는 만들지 않는다.)

drop function if exists public.food_videos_to_harvest_title(integer);
drop function if exists public.food_videos_to_harvest_title(integer, text);

create function public.food_videos_to_harvest_title(
  p_limit integer default 20, p_channel text default null)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(x order by rn, published_at desc nulls last), '[]'::jsonb) from (
    -- 채널별로 한 편씩 돌아가며 — 매일 올리는 채널이 큐를 독차지하지 못하게 한다
    select row_number() over (partition by v.channel order by v.published_at desc nulls last) rn,
           v.published_at,
           jsonb_build_object(
             'video_id', v.video_id, 'title', v.title, 'channel', v.channel,
             'published_at', v.published_at,
             'description', left(
               coalesce(v.description, '')
               || case when v.desc_i18n is not null then E'\n\n[번역]\n' || v.desc_i18n else '' end
               || case when v.tags is not null      then E'\n\n[태그] '  || v.tags      else '' end,
               2600)
           ) x
      from food_videos v
      join food_channels c on c.slug = v.channel and c.harvest
     where v.harvested_at is null
       and length(coalesce(v.title, '')) >= 6
       and (p_channel is null or v.channel = p_channel)
     order by rn, v.published_at desc nulls last
     limit greatest(coalesce(p_limit, 20), 1)
  ) q;
$$;
