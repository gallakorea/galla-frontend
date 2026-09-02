-- 한 영상이 여러 곳을 갈 때, 장소마다 다른 한 줄 (2026-09-02)
--
-- 사장님: "한 영상에 다양한 장소가 나오는 곳은 어쩔 거야, 보통 그래."
-- 실측: 장소가 붙은 영상 11,253편 중 **2,870편(26%)이 두 곳 이상**이고 최대 7곳이다.
-- 영상 한 줄만 있으면 그게 모든 장소 페이지에 똑같이 뜬다:
--   "터키 괴레메에 숙소를 잡고 스쿠터를 빌려 우치사르 성 주변을 둘러본다"
--   → 우치사르 성엔 맞지만 **괴레메 국립공원 페이지엔 엉뚱하다.**
--
-- → (영상, 장소) 쌍마다 한 줄을 붙인다. 화면은 note 를 먼저 쓰고 없으면 영상 gist 로 떨어진다.
-- 💰 한 곳짜리 영상(74%)은 gist 가 곧 그 장소 얘기라 **note 를 만들 필요가 없다.**
--    비용은 여러 곳 나오는 26%에만 붙는다.
alter table travel_place_sources add column if not exists note text;

create index if not exists travel_place_sources_note_idx
  on travel_place_sources (video_id, channel) where note is null;

/* 수확·백필이 같이 쓴다. 못 만든 것도 빈 문자열로 박아 큐가 줄게 한다. */
create or replace function travel_source_note_save(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; n int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    update travel_place_sources
       set note = coalesce(nullif(btrim(left(it->>'note', 160)), ''), '')
     where video_id = it->>'video_id'
       and channel  = it->>'channel'
       and place_id = (it->>'place_id')::uuid
       and note is null;
    if found then n := n + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'saved', n);
end $$;

/* 여러 곳이 나오는 영상만 준다 — 한 곳짜리는 영상 요약으로 충분하다. */
create or replace function travel_sources_to_note(p_limit int default 6)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select v.video_id, v.channel, v.title,
           left(coalesce(v.description, ''), 900) description,
           (select jsonb_agg(jsonb_build_object('place_id', s2.place_id, 'name', p.name))
              from travel_place_sources s2 join travel_places p on p.id = s2.place_id
             where s2.video_id = v.video_id and s2.channel = v.channel) places
      from travel_videos v
     where exists (select 1 from travel_place_sources s
                    where s.video_id = v.video_id and s.channel = v.channel and s.note is null)
       and (select count(*) from travel_place_sources s3
             where s3.video_id = v.video_id and s3.channel = v.channel) >= 2
     order by v.published_at desc nulls last
     limit greatest(least(p_limit, 12), 1)
  ) x;
$$;

/* 한 곳짜리 영상은 영상 요약을 그대로 note 로 복사한다 — AI 를 부를 이유가 없다. */
create or replace function travel_note_from_gist(p_limit int default 2000)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with one as (
    select s.video_id, s.channel, s.place_id, v.gist
      from travel_place_sources s
      join travel_videos v on v.video_id = s.video_id and v.channel = s.channel
     where s.note is null and v.gist is not null
       and (select count(*) from travel_place_sources s2
             where s2.video_id = s.video_id and s2.channel = s.channel) = 1
     limit greatest(coalesce(p_limit, 2000), 1)),
  upd as (
    update travel_place_sources t set note = one.gist
      from one
     where t.video_id = one.video_id and t.channel = one.channel
       and t.place_id = one.place_id and t.note is null
    returning 1)
  select count(*) into n from upd;
  return jsonb_build_object('ok', true, 'copied', n);
end $$;

revoke all on function travel_source_note_save(jsonb) from public, anon, authenticated;
revoke all on function travel_sources_to_note(int) from public, anon, authenticated;
revoke all on function travel_note_from_gist(int) from public, anon, authenticated;
