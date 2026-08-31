-- 대기열 해소 지원 RPC (2026-08-31)
--
-- 진단 결과: 상호는 뽑혔는데 주소가 없어 food_pending 에 쌓인 게 63건이다.
-- NCP Geocoding 은 주소→좌표라 상호로는 못 찾는다 → 네이버 지역검색으로 주소를 얻고,
-- 좌표는 이미 검증된 NCP Geocoding 에 맡긴다(지역검색의 mapx/mapy 는 좌표계 표기가
-- 버전마다 달라 함정이다 — 주소를 거치면 그 문제를 통째로 피한다).

/* 워커가 가져갈 대기 목록 */
create or replace function public.food_pending_take(p_limit int default 40)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'region_hint', region_hint,
      'channel', channel, 'video_id', video_id, 'video_title', video_title,
      'aired_at', aired_at, 'tries', tries)), '[]'::jsonb)
    from (select * from food_pending
           where status = 'pending' and tries < 3
           order by tries, id
           limit least(coalesce(p_limit,40), 200)) t;
$fn$;
revoke all on function public.food_pending_take(int) from public, anon, authenticated;

/* 해소 결과 반영 — 성공하면 food_places 로 승격하고 대기열에서 내린다 */
create or replace function public.food_pending_settle(p_id bigint, p_place jsonb default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_row food_pending%rowtype; v_res jsonb;
begin
  select * into v_row from food_pending where id = p_id;
  if not found then return jsonb_build_object('ok',false,'reason','no_row'); end if;

  if p_place is null then
    -- 못 찾았다 — 시도 횟수만 올린다. 3회를 넘기면 워커가 더 안 가져간다.
    update food_pending set tries = tries + 1,
           status = case when tries + 1 >= 3 then 'failed' else 'pending' end
     where id = p_id;
    return jsonb_build_object('ok',true,'resolved',false);
  end if;

  -- 승격: 출처(채널·영상)를 그대로 물려준다 — 어느 방송에서 왔는지가 이 서비스의 핵심이다
  v_res := food_ingest(jsonb_build_array(
    p_place || jsonb_build_object(
      'channel', v_row.channel, 'video_id', v_row.video_id,
      'video_title', v_row.video_title, 'aired_at', v_row.aired_at, 'origin', 'yt')));

  update food_pending set status = 'resolved' where id = p_id;
  return jsonb_build_object('ok',true,'resolved',true,'ingest',v_res);
end $fn$;
revoke all on function public.food_pending_settle(bigint,jsonb) from public, anon, authenticated;

select (select count(*) from food_pending where status='pending') as 대기중,
       (select count(*) from food_pending where status='failed')  as 실패,
       jsonb_array_length(food_pending_take(5)) as 표본;
