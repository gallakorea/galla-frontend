-- 태그가 새로 붙은 '장소 0곳' 영상을 한 번만 다시 태운다
--
-- 왜 도장이 필요한가: 조건만으로 재큐를 걸면 **무한 반복**이 된다.
-- 태그가 있어도 장소가 안 나오는 영상('세계여행'·'브이로그' 같은 잡태그뿐인 것)은
-- 다시 수확해도 0곳이고, 그러면 다음 회차에 또 재큐 대상이 된다.
-- retag_at 으로 '한 번 다시 태웠다'를 남겨 딱 한 번만 돌게 한다.
alter table travel_videos add column if not exists retag_at timestamptz;
grant select (retag_at) on travel_videos to anon, authenticated;

create or replace function public.travel_retag_requeue(p_limit integer default 2000)
returns jsonb language plpgsql security definer set search_path to 'public' as $BODY$
declare n int := 0;
begin
  with pick as (
    select v.video_id from travel_videos v
     where v.harvested_at is not null
       and v.retag_at is null
       and v.tags is not null and array_length(v.tags, 1) > 0
       and not exists (select 1 from travel_place_sources s where s.video_id = v.video_id)
     limit greatest(least(coalesce(p_limit, 2000), 20000), 1)
  )
  update travel_videos v set harvested_at = null, retag_at = now()
    from pick where v.video_id = pick.video_id;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'requeued', n);
end $BODY$;

grant execute on function public.travel_retag_requeue(integer) to service_role;
