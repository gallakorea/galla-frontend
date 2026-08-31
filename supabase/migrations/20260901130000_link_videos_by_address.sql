-- 영상↔맛집 매칭을 **거꾸로** 한다.
--
-- 지금 매처는 "우리 가게 이름이 그 채널 영상 텍스트에 들어있나"를 본다. 그래서
-- 상호를 안 쓰는 채널에선 통째로 헛돌았다(또간집 700편 → 9건).
-- 그런데 설명란을 채우고 보니 많은 채널이 **주소를 적는다**(김사원 296편 중 240편).
-- 주소는 상호보다 훨씬 강한 키다 — 표기 흔들림이 적고 동명이인이 없다.
--   실측(김사원): 이름 기반 18건 → 주소 기반 113편이 우리 가게와 붙는다.
--
-- ⚠️ '누가 갔나'가 거짓말이 되면 이 서비스는 끝이다. 그래서 애매하면 안 붙인다:
--    한 영상이 여러 집에 걸리거나(협찬·여러 집 소개), 한 집에 여러 영상이 걸리면 전부 버린다.
-- ⚠️ 새 행을 함부로 넣지 않는다. food_sources_uk 가 (place_id, channel, video_id) 라
--    insert 하면 video_id 가 다른 **두 번째 행**이 생겨 채널 곳수가 부풀려진다.
--    → 이미 있는 행(video_id is null)을 갱신하고, 없을 때만 넣는다.
create or replace function food_link_videos_by_address(p_channel text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare updated int := 0; inserted int := 0; cand int := 0;
begin
  create temp table _pair on commit drop as
  with v as (
    select video_id, title,
           regexp_replace((regexp_match(description,
             '([가-힣]+(?:시|군|구)\s+[가-힣0-9]+(?:로|길)\s*[0-9]+(?:-[0-9]+)?)'))[1],
             '\s', '', 'g') a
      from food_videos where channel = p_channel
  ),
  vv as (select * from v where a is not null and length(a) >= 8),
  p as (select id, regexp_replace(address, '\s', '', 'g') a from food_places where status = 'live'),
  m as (
    select vv.video_id, vv.title, p.id place_id
      from vv join p on p.a like '%' || vv.a || '%'
  )
  -- 1:1 인 쌍만 남긴다 — 애매한 건 안 붙이는 게 낫다
  select m.* from m
   where m.video_id in (select video_id from m group by video_id having count(*) = 1)
     and m.place_id in (select place_id from m group by place_id having count(*) = 1);

  select count(*) into cand from _pair;

  update food_place_sources s
     set video_id = t.video_id, video_title = t.title
    from _pair t
   where s.place_id = t.place_id and s.channel = p_channel and s.video_id is null;
  get diagnostics updated = row_count;

  insert into food_place_sources (place_id, channel, video_id, video_title)
  select t.place_id, p_channel, t.video_id, t.title
    from _pair t
   where not exists (select 1 from food_place_sources s
                      where s.place_id = t.place_id and s.channel = p_channel)
  on conflict do nothing;
  get diagnostics inserted = row_count;

  return jsonb_build_object('ok', true, 'channel', p_channel,
                            'candidates', cand, 'updated', updated, 'inserted', inserted);
end $$;

revoke all on function food_link_videos_by_address(text) from anon, authenticated;
