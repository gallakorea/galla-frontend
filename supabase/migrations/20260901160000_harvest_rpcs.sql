-- 수확 대상 고르기 / 도장 찍기.
--
-- ⚠️ 대상은 '설명에 주소가 있고 아직 안 물어본 영상'이다. 최신순으로 준다 —
--    오래된 영상일수록 가게가 이미 없어졌을 확률이 높다.
-- ⚠️ 도장은 성공 여부와 무관하게 찍는다(호출부가 그렇게 부른다). 안 그러면
--    실패한 영상을 매 회차 다시 LLM·네이버에 태운다.
create or replace function food_videos_to_harvest(p_channel text, p_limit integer default 20)
returns table(video_id text, title text, description text, published_at timestamptz)
language sql stable security definer set search_path = public as $$
  select v.video_id, v.title, v.description, v.published_at
    from food_videos v
   where v.channel = p_channel
     and v.harvested_at is null
     and v.description ~ '[가-힣]+(시|군|구)\s*[가-힣0-9]+(로|길)\s*[0-9]'
   order by v.published_at desc nulls last
   limit greatest(coalesce(p_limit, 20), 1);
$$;

create or replace function food_videos_mark_harvested(p_ids text[])
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update food_videos set harvested_at = now()
   where video_id = any(p_ids) and harvested_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function food_videos_to_harvest(text,integer) from anon, authenticated;
revoke all on function food_videos_mark_harvested(text[]) from anon, authenticated;
