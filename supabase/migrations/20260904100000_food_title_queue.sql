-- 설명란에 주소가 없는 영상용 큐
--
-- 왜: 기존 수확 크론은 설명이 `[가-힣]+(시|군|구)...(로|길) [0-9]` 에 걸리는 영상만 골랐다.
-- 실측(2026-09-04): 미처리 13,023편 중 이 정규식에 걸리는 건 **0편**이다 —
-- 주소가 적힌 영상은 이미 다 처리됐고, 크론은 그 뒤로 빈손으로 돌고 있었다.
-- 그래서 맛집 영상 14,506편 중 가게에 붙은 건 1,457편(10%)에서 멈춰 있다.
--
-- 남은 것들은 주소가 없는 대신 **제목에 상호가 있다**("악명높은 수원의 수원칼국수").
-- 그건 네이버 지역검색으로 주소를 되찾을 수 있다. 이 큐가 그 대상을 준다.
create or replace function public.food_videos_to_harvest_title(p_limit integer default 20)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select jsonb_build_object(
      'video_id', v.video_id,
      'title', v.title,
      'channel', v.channel,
      'published_at', v.published_at,
      'description', left(coalesce(v.description, ''), 1200)
    ) x
      from food_videos v
     where v.harvested_at is null
       and length(coalesce(v.title, '')) >= 6
     order by v.published_at desc nulls last
     limit greatest(coalesce(p_limit, 20), 1)
  ) q;
$$;

grant execute on function public.food_videos_to_harvest_title(integer) to service_role;
