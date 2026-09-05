-- 퀴즈 문제 고르는 조건이 너무 좁았다.
--
-- 실측 2026-09-05: 백반기행 3,143편 중 지역이 잡힌 게 2,451편인데 퀴즈 후보는 102편뿐이었다.
-- 이유: 제목 점수를 '맛집|EP|특집' 같은 말에 기대는데, 이 프로 제목은 음식 이름 위주다 —
--   "재료별, 단계별로 즐기는 우럭 미역 맑은 탕 [식객 허영만의 백반기행] 26회"
--   "사르르 입에서 녹는 한우 우설 수육 & 한우 볼살 수육"
-- 방송 프로는 상호를 제목에 안 쓴다(광고가 되니까). 그래서 **음식 이름**이 제목에 온다.
--
-- 🔴 그런데 그게 곧 퀴즈로 좋은 조건이다 — 지역과 음식이 있으면 사람이 맞힐 수 있다.
--   "종로 + 우럭 미역 맑은 탕" 이면 아는 사람은 안다.
-- → 지역이 잡혔고 제목이 충분히 길면(쇼츠 한 줄이 아니면) 문제로 낸다.
--   쇼츠·잡담은 제목이 짧고 지역도 안 잡힌다 — 그것만 걸러도 충분하다.
create or replace function public.food_quiz_next(
  p_limit integer default 1, p_channel text default null, p_video text default null)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'video_id', video_id, 'title', title, 'channel', channel,
           'channel_name', cname, 'region', region) order by score desc, published_at desc), '[]'::jsonb)
    from (
      select v.video_id, v.title, v.channel, c.name cname, v.region, v.published_at,
             (case when v.title ~ 'EP\.?[0-9]|[0-9]+화|특집|회 ' then 2 else 0 end
            + case when v.title ~ '맛집|식당|먹방|투어|털었|가야|추천|골목|노포' then 2 else 0 end
            + least(length(coalesce(v.title,'')) / 12, 3)) score
        from food_videos v
        join food_channels c on c.slug = v.channel and c.active
       where (p_video is not null or v.harvested_at is null)
         and (p_video is null or v.video_id = p_video)
         and (p_channel is null or v.channel = p_channel)
         and (p_video is not null or coalesce(v.region,'') <> '')      -- 지역이 곧 문제의 뼈대
         and (p_video is not null or length(coalesce(v.title,'')) >= 14) -- 쇼츠 한 줄 제목 배제
         and (p_video is not null
              or not exists (select 1 from food_place_sources s where s.video_id = v.video_id))
         and (p_video is not null
              or not exists (select 1 from food_quiz_answers a
                              where a.video_id = v.video_id and a.user_id = auth.uid()))
       order by score desc, random()
       limit greatest(coalesce(p_limit, 1), 1)
    ) q;
$$;
revoke all on function public.food_quiz_next(integer, text, text) from public, anon;
grant execute on function public.food_quiz_next(integer, text, text) to authenticated;

-- 크리에이터 페이지의 '이 식당 어디게?' 표시도 같은 기준으로
create or replace function food_channel_videos(p_slug text, p_limit integer default 24,
                                               p_offset integer default 0)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ok', true,
    'total', (select count(*) from food_videos where channel = p_slug),
    'videos', coalesce((select jsonb_agg(jsonb_build_object(
        'video_id', v.video_id, 'title', v.title, 'at', v.published_at,
        'shops', (select count(*) from food_place_sources s where s.video_id = v.video_id),
        'askable', coalesce(v.region,'') <> '' and length(coalesce(v.title,'')) >= 14)
        order by v.published_at desc nulls last)
      from (select * from food_videos where channel = p_slug
             order by published_at desc nulls last
             limit least(coalesce(p_limit,24), 60) offset greatest(coalesce(p_offset,0),0)) v),
      '[]'::jsonb));
$$;
grant execute on function food_channel_videos(text,integer,integer) to anon, authenticated;
