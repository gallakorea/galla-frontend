-- 영상마다 '무슨 내용인지' 한 줄 (2026-09-02)
--
-- 사장님: "영상마다 내용을 함축적으로 표기하는 게 나중에 우리 검색이나
--          사용자가 미리 보고 보는 데 좋을 듯한데."
-- 맞다. 지금 화면에 뜨는 건 유튜브 제목인데 낚시성이라 내용이 안 보인다:
--   "여행 난이도 최악이라는 피라미드 근황 - 🇪🇬2"
--   "다시 찾은 피라미드, 호객꾼이 줄었다...? 【이집트3】"
-- 이걸로는 볼지 말지 못 정한다.
--
-- 💰 **추가 비용이 0이다.** 수확할 때 영상마다 이미 AI 를 한 번 부른다(장소 추출).
--    그 응답에 한 줄만 더 받으면 된다. 따로 도는 요약 배치를 만들면 2만 번을 새로 부르게 된다.
-- ⚠️ 이미 수확한 영상(약 15,000편)은 이 값이 비어 있다. 나중에 한 번 훑어야 한다
--    — 그때는 '설명 없는 영상 댓글 재시도'와 같이 도는 게 싸다(같은 영상을 두 번 안 부르게).
alter table travel_videos add column if not exists gist text;

create index if not exists travel_videos_gist_idx
  on travel_videos (channel) where gist is not null;

/* 수확 회차가 장소와 함께 실어 보낸다. 장소가 0개인 영상도 요약은 남는다 —
   오히려 그런 영상일수록 제목만으로는 뭔지 몰라서 요약이 필요하다. */
create or replace function travel_gist_save(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; n int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    update travel_videos
       set gist = nullif(btrim(left(it->>'gist', 160)), '')
     where video_id = it->>'video_id'
       and channel = it->>'channel'
       and gist is null;
    if found then n := n + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'saved', n);
end $$;

revoke all on function travel_gist_save(jsonb) from public, anon, authenticated;
