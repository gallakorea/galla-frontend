-- '누가 갔다'는데 영상이 안 붙은 가게 9,027곳 — 링커가 매번 조용히 죽고 있었다.
--
-- link-food-videos 는 영상 1.4만 편 카탈로그와 대상 3만 건을 엣지 함수 메모리로 다 올린 뒤
-- 자바스크립트로 문자열을 대조하고, 링크 하나마다 UPDATE 를 한 번씩 날렸다.
-- 엣지 함수는 150초에서 끊긴다 — 끝까지 간 적이 없다. 그런데 pg_cron 이력엔 성공으로 남는다
-- (수집 함수에서 밟은 것과 같은 함정).
-- → 대조를 DB 안에서 한다. 데이터를 옮기지 않으니 비교도 갱신도 한 번에 끝난다.

-- 이름 정규화를 미리 박아둔다 — 매 실행 14,506편에 regexp 를 다시 돌리면 그것만으로 타임아웃난다
alter table food_videos add column if not exists hay text;
update food_videos
   set hay = lower(regexp_replace(coalesce(title,'') || ' ' || coalesce(description,''), '[[:space:]]', '', 'g'))
 where hay is null;
create or replace function public.food_videos_hay() returns trigger language plpgsql as $$
begin
  new.hay := lower(regexp_replace(coalesce(new.title,'') || ' ' || coalesce(new.description,''), '[[:space:]]', '', 'g'));
  return new;
end $$;
drop trigger if exists food_videos_hay_t on food_videos;
create trigger food_videos_hay_t before insert or update of title, description
  on food_videos for each row execute function public.food_videos_hay();
create index if not exists food_videos_ch_hay on food_videos(channel);

create or replace function public.food_link_videos_by_name(p_limit integer default 500)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_linked int := 0; v_seen int := 0;
begin
  with tgt as (
    select s.id, s.place_id, s.channel,
           lower(regexp_replace(p.name, '[[:space:]]', '', 'g')) nm
      from food_place_sources s
      join food_places p on p.id = s.place_id
     where s.video_id is null
       and length(regexp_replace(p.name, '[[:space:]]', '', 'g')) >= 4
     limit greatest(coalesce(p_limit, 500), 1)
  ),
  /* ⚠️ 네 글자 미만은 아예 안 본다. 짧은 상호는 엉뚱한 영상에 걸린다 —
     '누가 갔나'가 거짓말이 되면 서비스가 통째로 무너진다. 포기하는 게 낫다. */
  hit as (
    select distinct on (t.id) t.id, v.video_id, v.title, v.published_at
      from tgt t
      join food_videos v on v.channel = t.channel and v.hay like '%' || t.nm || '%'
     order by t.id, v.published_at desc nulls last
  ),
  upd as (
    update food_place_sources s
       set video_id = h.video_id, video_title = left(h.title, 200), aired_at = h.published_at
      from hit h
     where s.id = h.id
       /* 같은 (가게·채널·영상) 행이 이미 있으면 갱신하지 않는다 — 유니크 키에 걸린다 */
       and not exists (select 1 from food_place_sources b
                        where b.place_id = s.place_id and b.channel = s.channel
                          and b.video_id = h.video_id)
     returning 1
  )
  select (select count(*) from tgt), (select count(*) from upd) into v_seen, v_linked;
  return jsonb_build_object('ok', true, 'seen', v_seen, 'linked', v_linked);
end $$;
revoke all on function public.food_link_videos_by_name(integer) from public, anon, authenticated;

-- 🔴 영상 붙은 행이 생겼는데 옛 '영상 없음' 행이 그대로 남아 한 채널이 두 번 뜬다.
--    유니크 키가 (place_id, channel, video_id) 라서 둘이 서로 다른 키로 공존한다.
create or replace function public.food_sources_drop_empty_dups()
returns integer language sql security definer set search_path to 'public' as $$
  with d as (
    delete from food_place_sources a
     where a.video_id is null
       and exists (select 1 from food_place_sources b
                    where b.place_id = a.place_id and b.channel = a.channel
                      and b.video_id is not null)
    returning 1)
  select count(*)::int from d;
$$;
revoke all on function public.food_sources_drop_empty_dups() from public, anon, authenticated;
