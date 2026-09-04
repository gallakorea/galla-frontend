-- 주소 기반 링커를 전 채널·번역·태그까지 확장한다.
--
-- 왜: '누가 갔다'는데 영상이 안 붙은 출처가 8,807건이다. 이름 기반은 13,271건 훑어 135건뿐이었다
--     (수확이 **네이버 공식 상호**로 저장하는데 영상은 짧은 이름으로 부른다 —
--      '본가설렁탕 강남점' vs '본가설렁탕'. 지점 접미사를 떼봐도 18건 더였다).
--     주소는 상호보다 강한 키다 — 표기 흔들림이 적고 동명이인이 없다.
--
-- 기존 food_link_videos_by_address 는 ① 채널을 하나씩만 받고(temp table on commit drop 이라
-- 한 트랜잭션에서 여러 번 못 부른다) ② 설명 원문만 본다. 번역·태그는 안 본다 —
-- 그런데 주소가 거기 있는 영상이 많다(먹을텐데는 인도네시아어 번역에만 주소가 있었다).
-- ③ 영상당 주소를 하나만 뽑는다.
--
-- ⚠️ 애매하면 안 붙인다. 다만 1:1 을 한쪽만 건다:
--    **한 가게에 후보 영상이 둘 이상이면 버린다**(누가 갔는지 틀리면 거짓말이 된다).
--    한 영상이 여러 가게를 가리키는 건 정상이다 — 맛집 여러 곳 도는 영상이 흔하다.
create or replace function public.food_link_videos_by_address_all(p_limit integer default 100000)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_upd int := 0; v_cand int := 0;
begin
  with v as (
    select v.channel, v.video_id, v.title, v.published_at,
           regexp_replace(m[1], '[[:space:]]', '', 'g') a
      from food_videos v,
           lateral regexp_matches(
             coalesce(v.description,'') || ' ' || coalesce(v.desc_i18n,'') || ' ' || coalesce(v.tags,''),
             '([가-힣]+(?:시|군|구)[[:space:]]+[가-힣0-9]+(?:로|길)[[:space:]]*[0-9]+(?:-[0-9]+)?)', 'g') m
  ),
  vv as (select * from v where length(a) >= 8),
  p as (select id, channel_hint, a from (
          select s.id sid, s.place_id id, s.channel channel_hint,
                 regexp_replace(pl.address, '[[:space:]]', '', 'g') a
            from food_place_sources s join food_places pl on pl.id = s.place_id
           where s.video_id is null and pl.status = 'live' and coalesce(pl.address,'') <> ''
           limit greatest(coalesce(p_limit, 100000), 1)) q),
  m as (
    select vv.channel, vv.video_id, vv.title, vv.published_at, p.id place_id
      from vv join p on p.channel_hint = vv.channel and p.a like '%' || vv.a || '%'
  ),
  /* 한 가게에 영상이 둘 이상 걸리면 통째로 버린다 */
  one as (select * from m where place_id in (select place_id from m group by place_id having count(*) = 1)),
  upd as (
    update food_place_sources s
       set video_id = o.video_id, video_title = left(o.title, 200), aired_at = o.published_at
      from one o
     where s.place_id = o.place_id and s.channel = o.channel and s.video_id is null
       and not exists (select 1 from food_place_sources b
                        where b.place_id = s.place_id and b.channel = s.channel
                          and b.video_id = o.video_id)
     returning 1)
  select (select count(*) from m), (select count(*) from upd) into v_cand, v_upd;
  return jsonb_build_object('ok', true, 'candidates', v_cand, 'linked', v_upd);
end $$;
revoke all on function public.food_link_videos_by_address_all(integer) from public, anon, authenticated;
