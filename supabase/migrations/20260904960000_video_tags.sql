-- 영상 **태그**도 수확에 넣는다. 지역 힌트가 거기 있다.
--
-- 태그는 주소가 아니라 지역·업종 힌트다('#부산 #사직 #성수동맛집'). 그래서 주소 기반 경로가
-- 아니라 **제목 기반 경로**에 얹어야 값이 난다 — 그쪽은 주소를 요구하지 않고 상호+지역으로
-- 네이버에 물어본다. 실측: 또간집은 한국어 설명이 해시태그뿐인데 영어 태그에 '#Busan' 이 있었다.
--
-- 📌 그리고 제목 경로에 **번역이 안 들어가고 있었다**. 주소 경로만 붙여놨다. 둘 다 넣는다.
-- 비용 0: videos.list 는 part 를 늘려도 1유닛이고, id 50개까지 한 번에 받는다.
alter table food_videos add column if not exists tags text;
alter table food_videos add column if not exists tags_at timestamptz;

create or replace function food_videos_need_tags(p_channel text default null, p_limit int default 50)
returns table(video_id text) language sql stable security definer set search_path to 'public' as $$
  select v.video_id from food_videos v
   where v.tags_at is null
     and (p_channel is null or v.channel = p_channel)
     and v.harvested_at is null          -- 이미 수확한 영상은 굳이 다시 안 받는다
   order by v.published_at desc nulls last
   limit greatest(coalesce(p_limit,50),1);
$$;

create or replace function food_video_tags_set(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; n int := 0; hit int := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    update food_videos
       set tags = nullif(btrim(coalesce(r->>'tags','')), ''),
           tags_at = now()
     where video_id = r->>'video_id';
    n := n + 1;
    if length(coalesce(r->>'tags','')) > 0 then hit := hit + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'saved', n, 'withTags', hit);
end $$;

-- 제목 경로에 **번역 + 태그**를 얹는다. 주소가 없어도 지역 힌트로 찾아낼 수 있다.
create or replace function food_videos_to_harvest_title(p_limit integer default 20)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select jsonb_build_object(
      'video_id', v.video_id,
      'title', v.title,
      'channel', v.channel,
      'published_at', v.published_at,
      'description', left(
        coalesce(v.description, '')
        || case when v.desc_i18n is not null then E'\n\n[번역]\n' || v.desc_i18n else '' end
        || case when v.tags is not null      then E'\n\n[태그] '  || v.tags      else '' end,
        2600)
    ) x
      from food_videos v
     where v.harvested_at is null
       and length(coalesce(v.title, '')) >= 6
     order by v.published_at desc nulls last
     limit greatest(coalesce(p_limit, 20), 1)
  ) q;
$$;

-- 주소 경로에도 태그를 붙인다(태그에 도로명이 적힌 영상도 가끔 있다)
create or replace function food_videos_to_harvest(p_channel text, p_limit integer default 20)
returns table(video_id text, title text, description text, published_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select v.video_id, v.title,
         btrim(coalesce(v.description,'')
           || case when v.desc_i18n is not null then E'\n\n[번역]\n' || v.desc_i18n else '' end
           || case when v.tags is not null      then E'\n\n[태그] '  || v.tags      else '' end),
         v.published_at
    from food_videos v
   where v.channel = p_channel
     and v.harvested_at is null
     and (food_has_addr(v.description) or food_has_addr(v.desc_i18n) or food_has_addr(v.tags))
   order by v.published_at desc nulls last
   limit greatest(coalesce(p_limit, 20), 1);
$$;

revoke all on function food_videos_need_tags(text,int) from public, anon, authenticated;
revoke all on function food_video_tags_set(jsonb)      from public, anon, authenticated;
grant execute on function food_videos_need_tags(text,int), food_video_tags_set(jsonb) to service_role;
