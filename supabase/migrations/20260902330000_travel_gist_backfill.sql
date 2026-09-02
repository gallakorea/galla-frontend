-- 이미 수확한 영상의 요약을 채우기 위한 큐 (2026-09-02)
--
-- 사장님: "기존 15,000편도 요약 채워."
-- 수확이 지나간 영상은 gist 가 비어 있다(요약 기능을 오늘 붙였으므로).
-- ⚠️ 장소 소스가 있는 영상을 먼저 준다 — 화면에 실제로 뜨는 게 그것들이다.
--    아무도 안 보는 영상 요약을 먼저 채우면 돈은 같이 쓰고 효과만 늦다.
create or replace function travel_videos_to_gist(p_limit int default 30)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select v.video_id, v.channel, v.title,
           left(coalesce(v.description, ''), 500) description
      from travel_videos v
     where v.harvested_at is not null
       and v.gist is null
       and v.title is not null
     order by exists (select 1 from travel_place_sources s
                       where s.video_id = v.video_id and s.channel = v.channel) desc,
              v.published_at desc nulls last
     limit greatest(least(p_limit, 60), 1)
  ) x;
$$;

/* 못 만든 영상도 표시해야 매 회차 같은 걸 또 물어보지 않는다.
   ⚠️ 빈 문자열로 채운다 — null 로 두면 큐에 영원히 남는다. */
create or replace function travel_gist_mark(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; n int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    update travel_videos
       set gist = coalesce(nullif(btrim(left(it->>'gist', 160)), ''), '')
     where video_id = it->>'video_id' and channel = it->>'channel' and gist is null;
    if found then n := n + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'marked', n);
end $$;

revoke all on function travel_videos_to_gist(int) from public, anon, authenticated;
revoke all on function travel_gist_mark(jsonb) from public, anon, authenticated;
