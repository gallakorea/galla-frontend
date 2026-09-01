-- 같은 유튜브 채널을 두 번 등록해놨다. 상세에 같은 영상이 두 줄로 뜨던 진짜 원인이다.
--
--   먹을텐데 + 성시경    → UCl23-Cci_SMqyGXE1T_LYUg (같은 채널). 영상 400편이 통째로 중복.
--   쯔양     + 쯔양 몇끼 → UCfpaSruWW3S4dibonKXENjA (같은 채널).
--
-- '먹을텐데'는 성시경 채널의 코너 이름이고, '쯔양 몇끼'도 쯔양 채널의 코너다.
-- 코너를 채널로 착각해 따로 등록한 결과, 한 영상이 두 채널 카탈로그에 각각 들어가
-- '누가 다녀갔나'에 같은 영상이 두 번 그려졌다(사장님 실측: 까치네).
--
-- ⚠️ 남길 쪽은 데이터가 많은 쪽이다(둘 다 750편 vs 400편).
-- ⚠️ 출처는 (place_id, channel, video_id) 유니크라, 옮기기 전에 충돌할 행을 먼저 지운다.
--    지우는 건 '같은 집 + 같은 영상'이라 잃는 정보가 없다.

create or replace function food_merge_channel(p_keep text, p_drop text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_src int; n_vid int; n_del int;
begin
  if p_keep = p_drop then return jsonb_build_object('ok', false, 'reason', 'same'); end if;

  -- 남길 채널에 이미 같은 (집, 영상)이 있으면 버릴 쪽 행을 지운다
  delete from food_place_sources d
   where d.channel = p_drop
     and exists (select 1 from food_place_sources k
                  where k.channel = p_keep and k.place_id = d.place_id
                    and k.video_id is not distinct from d.video_id);
  get diagnostics n_del = row_count;

  update food_place_sources set channel = p_keep where channel = p_drop;
  get diagnostics n_src = row_count;

  -- 영상 카탈로그도 합친다. 같은 video_id 가 남길 쪽에 있으면 버린다
  delete from food_videos d
   where d.channel = p_drop
     and exists (select 1 from food_videos k where k.channel = p_keep and k.video_id = d.video_id);
  update food_videos set channel = p_keep where channel = p_drop;
  get diagnostics n_vid = row_count;

  delete from food_channels where slug = p_drop;
  return jsonb_build_object('ok', true, 'moved_sources', n_src,
                            'dropped_dup_sources', n_del, 'moved_videos', n_vid);
end $$;

revoke all on function food_merge_channel(text, text) from anon, authenticated;

-- 같은 유튜브 채널을 두 번 등록하는 걸 DB 가 막는다.
-- ⚠️ 이번 사고는 '코너 이름'을 별개 채널로 등록해서 났다(먹을텐데=성시경, 쯔양 몇끼=쯔양).
--    사람이 이름만 보면 또 틀린다. 채널 ID 로 못박는다.
create unique index if not exists food_channels_ytid_uk
  on food_channels (yt_channel_id) where yt_channel_id is not null;
